"""
BestMe — Upload Validation
============================
Shared guards for the image endpoints.

Both vision endpoints cost real money per call and read the whole file into
memory, so they validate type and size before doing any work.
"""

from __future__ import annotations

import base64

from fastapi import HTTPException, UploadFile, status

# Generous for a phone photo after client-side resizing, small enough that a
# stray upload can't exhaust the server's memory.
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB

# Formats the Claude vision API accepts.
ALLOWED_MEDIA_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}


async def read_image_upload(file: UploadFile) -> tuple[str, str]:
    """
    Validate an uploaded image and return it as ``(base64_data, media_type)``.

    Raises:
        HTTPException: 400 for a non-image or unsupported format,
                       413 when the file exceeds MAX_IMAGE_BYTES.
    """
    content_type = (file.content_type or "").lower().split(";")[0].strip()

    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser una imagen.",
        )

    if content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato no admitido. Usa JPEG, PNG o WebP.",
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen está vacía.",
        )

    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"La imagen supera el límite de "
                f"{MAX_IMAGE_BYTES // (1024 * 1024)} MB."
            ),
        )

    # Claude expects image/jpeg rather than the image/jpg some clients send.
    normalised = "image/jpeg" if content_type == "image/jpg" else content_type

    return base64.b64encode(contents).decode("utf-8"), normalised
