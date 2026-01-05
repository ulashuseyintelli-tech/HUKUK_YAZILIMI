from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from datetime import datetime

def build_weekly_pdf(output_path: str, title: str, lines: list[str]) -> str:
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    y = height - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, title)
    y -= 25
    c.setFont("Helvetica", 10)
    c.drawString(40, y, f"Generated: {datetime.now().isoformat()}")
    y -= 30
    for line in lines[:60]:
        c.drawString(40, y, line[:120])
        y -= 14
        if y < 60:
            c.showPage()
            y = height - 50
            c.setFont("Helvetica", 10)
    c.save()
    return output_path
