/**
 * Transforms a Cloudinary image URL to include resize/quality transformations.
 * If the URL is not a Cloudinary URL, returns it as-is.
 */
export function getCloudinaryThumbnail(
    url: string,
    width: number,
    height: number
): string {
    if (!url) return '';
    if (!url.includes('cloudinary.com')) return url;
    // Insert transformation parameters after /upload/
    return url.replace(
        '/upload/',
        `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`
    );
}

/**
 * Uploads a file to Cloudinary using an unsigned upload preset.
 * Perfect for Proof of Payment screenshots.
 */
export async function uploadToCloudinary(file: File): Promise<string> {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
        console.error("Cloudinary config missing in .env");
        throw new Error("Cloudinary configuration missing");
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'payment_proofs'); // Organize in a subfolder

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
            method: 'POST',
            body: formData,
        }
    );

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Cloudinary Upload Error:", errorData);
        throw new Error(errorData.error?.message || "Upload failed");
    }

    const data = await response.json();
    return data.secure_url;
}
