"""Reads what a patient sent: a PDF's own text, or OCR for photos and scanned pages.

OCR runs on this computer with RapidOCR's Latin model, which keeps Slovak and German
diacritics. Its models are fetched once with `clinical-worker fetch-ocr-model`."""

import io
from pathlib import Path
from typing import Any

from .errors import ErrorCategory, WorkerError

MAX_PAGES = 30
PAGE_CHARACTERS = 20000  # the database keeps at most this much of one page
SCANNED_BELOW = 20  # a PDF page with less text than this is a scan, so OCR reads it
RENDER_SCALE = 2  # scanned pages are rendered at about 144 dpi before OCR


def ocr_models_present(model_dir: Path) -> bool:
    return len(list(model_dir.glob("*.onnx"))) >= 3


class Reader:
    def __init__(self, model_dir: Path) -> None:
        self.model_dir = model_dir
        self._ocr: Any = None

    def load(self) -> Any:
        """Loads the OCR models, downloading any that are missing. The engine itself calls this
        only once `ocr_models_present` says they are on disk."""
        if self._ocr is None:
            from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR

            self._ocr = RapidOCR(
                params={
                    "Global.model_root_dir": str(self.model_dir),
                    "Global.log_level": "warning",
                    "Rec.lang_type": LangRec.LATIN,
                    "Rec.ocr_version": OCRVersion.PPOCRV5,
                    "Rec.model_type": ModelType.MOBILE,
                }
            )
            # Each model loads (and, from `fetch-ocr-model`, downloads) now, not halfway through
            # a patient's document.
            for step in ("_load_det_model", "_load_cls_model", "_load_rec_model"):
                getattr(self._ocr, step)()
        return self._ocr

    def ocr(self, image: Any) -> str:
        if not ocr_models_present(self.model_dir):
            raise WorkerError(ErrorCategory.OCR_MODEL_UNAVAILABLE)
        return "\n".join(self.load()(image).txts or ())

    def read(self, data: bytes, media_type: str) -> list[str]:
        """One text per page. An empty text means nothing legible was found on that page."""
        try:
            if media_type == "application/pdf":
                pages = self._read_pdf(data)
            else:
                from PIL import Image, ImageOps

                with Image.open(io.BytesIO(data)) as image:
                    # Phone photos are often stored sideways, with a note saying which way is up.
                    pages = [self.ocr(ImageOps.exif_transpose(image).convert("RGB"))]
        except WorkerError:
            raise
        except Exception as exc:  # a broken or unusual file
            raise WorkerError(ErrorCategory.DOCUMENT_UNREADABLE) from exc
        return [page.strip()[:PAGE_CHARACTERS] for page in pages]

    def _read_pdf(self, data: bytes) -> list[str]:
        import pypdfium2 as pdfium  # type: ignore[import-untyped]

        pdf = pdfium.PdfDocument(data)
        try:
            pages = []
            for index in range(min(len(pdf), MAX_PAGES)):
                page = pdf[index]
                text: str = page.get_textpage().get_text_range().strip()
                if len(text) < SCANNED_BELOW:
                    text = self.ocr(page.render(scale=RENDER_SCALE).to_pil())
                pages.append(text)
            return pages
        finally:
            pdf.close()
