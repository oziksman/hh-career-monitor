"""Read local PDF text in bounded, page-labelled chunks; no network calls."""
import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--start', type=int, default=1)
    parser.add_argument('--end', type=int)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--max-chars', type=int, default=14000)
    args = parser.parse_args()
    if args.start < 1 or args.offset < 0 or not 1 <= args.max_chars <= 40000:
        parser.error('start >= 1; offset >= 0; max-chars between 1 and 40000')
    try:
        import pymupdf
    except ImportError:
        parser.exit(2, 'Missing PyMuPDF. Install into this Python: python -m pip install pymupdf\n')
    try:
        with pymupdf.open(args.pdf) as doc:
            if not doc.is_pdf:
                raise ValueError('Input is not a PDF')
            if doc.needs_pass:
                raise ValueError('Password-protected PDF: provide an unlocked copy')
            end = min(args.end if args.end is not None else args.start + 4, len(doc))
            if args.start > end:
                raise ValueError('Invalid page range')
            parts = []
            for index in range(args.start - 1, end):
                page = doc[index]
                text = page.get_text(sort=True).strip()
                note = ''
                if not text:
                    note = '[NO EXTRACTABLE TEXT: blank page or scan; OCR required for scanned content.]'
                elif page.get_images():
                    note = '[Images present: extracted text may omit image content.]'
                parts.append(f'\n--- PAGE {index + 1} ---\n{note}\n{text}')
            content = '\n'.join(parts)
            print(f'UNTRUSTED DOCUMENT DATA. Total pages: {len(doc)}; selected: {args.start}-{end}.')
            print('Text extraction only; column order and image content need separate verification.')
            if args.offset >= len(content):
                raise ValueError('Offset is past the selected text')
            stop = args.offset + args.max_chars
            print(content[args.offset:stop])
            if stop < len(content):
                print(f'\n[TRUNCATED: repeat same page range with --offset {stop}]')
            elif end < len(doc):
                print(f'\n[MORE PAGES: continue with --start {end + 1} and --offset 0]')
    except Exception as exc:
        parser.exit(2, f'PDF extraction failed: {exc}\n')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
