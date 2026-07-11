// S – single responsibility: manages preview state and data fetching
// D – depends on the S3 client abstraction, not on a concrete implementation

import { useState, useCallback, useRef } from 'react';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getPreviewType, getMimeType } from '../utils/fileUtils';

/**
 * @param {import('@aws-sdk/client-s3').S3Client} s3Client
 * @param {string|null} bucket
 * @param {(msg: string, type: string) => void} showAlert
 */
export function useFilePreview(s3Client, bucket, showAlert) {
    const [previewItem, setPreviewItem] = useState(null);
    const [previewObjectUrl, setPreviewObjectUrl] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    // Monotonic id of the latest open request: lets an in-flight fetch detect
    // that the preview was closed or replaced meanwhile, so its result is
    // discarded (and its blob URL revoked) instead of leaking.
    const requestSeqRef = useRef(0);

    const openPreview = useCallback(async (key) => {
        const type = getPreviewType(key);
        if (!type || !s3Client || !bucket) return;

        const seq = ++requestSeqRef.current;
        // Show modal with spinner immediately; revoke any previous blob URL
        // (e.g. when opening a preview while another one is already open).
        setPreviewItem({ key, type });
        setPreviewObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        setIsLoadingPreview(true);

        try {
            const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            const data = await response.Body.transformToByteArray();
            const blob = new Blob([data], { type: getMimeType(key) });
            const url = URL.createObjectURL(blob);
            if (seq !== requestSeqRef.current) {
                // Preview was closed or replaced while fetching: drop the result.
                URL.revokeObjectURL(url);
                return;
            }
            setPreviewObjectUrl(url);
        } catch (err) {
            console.error('Preview failed:', err);
            if (seq !== requestSeqRef.current) return;
            showAlert(`Failed to preview "${key.split('/').pop()}".`, 'error');
            setPreviewItem(null);
        } finally {
            if (seq === requestSeqRef.current) setIsLoadingPreview(false);
        }
    }, [s3Client, bucket, showAlert]);

    const closePreview = useCallback(() => {
        // Invalidate any in-flight fetch so its late result is discarded.
        requestSeqRef.current++;
        // Revoke the blob URL to free memory
        setPreviewObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        setPreviewItem(null);
        setIsLoadingPreview(false);
    }, []);

    return { previewItem, previewObjectUrl, isLoadingPreview, openPreview, closePreview };
}
