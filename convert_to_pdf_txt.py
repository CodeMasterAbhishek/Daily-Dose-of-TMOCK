"""
Dataset Converter: CSV to PDF and TXT
Converts scratch/sonyliv_master_dataset.csv into scratch/sonyliv_master_dataset.pdf and scratch/sonyliv_master_dataset.txt
for 100% compatibility with ChatGPT, Gemini, and Claude file upload.
"""

import csv
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def convert_csv():
    scratch_dir = os.path.join(os.path.dirname(__file__), 'scratch')
    csv_file = os.path.join(scratch_dir, 'sonyliv_master_dataset.csv')
    pdf_file = os.path.join(scratch_dir, 'sonyliv_master_dataset.pdf')
    txt_file = os.path.join(scratch_dir, 'sonyliv_master_dataset.txt')

    if not os.path.exists(csv_file):
        print(f"Error: {csv_file} not found!")
        return

    print("Reading CSV dataset...")
    rows = []
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if row:
                rows.append(row)

    print(f"Loaded {len(rows)} episode entries.")

    # 1. Generate Plain Text File (.txt) - Supported by ALL LLMs
    print("Generating TXT file...")
    with open(txt_file, 'w', encoding='utf-8') as f:
        f.write("TMKOC OFFICIAL SONY LIV EPISODE MASTER DATASET\n")
        f.write("================================================================================\n\n")
        for r in rows:
            ep_num = r[0] if len(r) > 0 else ""
            name = r[1] if len(r) > 1 else ""
            desc = r[2] if len(r) > 2 else ""
            air_date = r[3] if len(r) > 3 else ""
            f.write(f"EPISODE {ep_num}: {name}\n")
            f.write(f"Air Date: {air_date}\n")
            f.write(f"Description: {desc}\n")
            f.write("--------------------------------------------------------------------------------\n")

    print(f"Successfully generated TXT file: {txt_file}")

    # 2. Generate PDF File (.pdf)
    print("Generating PDF document...")
    doc = SimpleDocTemplate(pdf_file, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], fontSize=16, leading=20, textColor=colors.HexColor('#0f172a'))
    sub_style = ParagraphStyle('SubStyle', parent=styles['Normal'], fontSize=9, leading=12, textColor=colors.HexColor('#475569'))

    story = [
        Paragraph("<b>TMKOC Official Sony LIV Episode Master Dataset</b>", title_style),
        Paragraph(f"Total Episodes Compiled: {len(rows)} | Format: PDF & TXT", sub_style),
        Spacer(1, 12)
    ]

    # Process first 500 episodes into PDF table for compact size
    table_data = [[Paragraph("<b>Ep #</b>", sub_style), Paragraph("<b>Episode Title</b>", sub_style), Paragraph("<b>Description & Air Date</b>", sub_style)]]
    
    for r in rows[:500]:
        ep_num = r[0] if len(r) > 0 else ""
        name = r[1] if len(r) > 1 else ""
        desc = r[2] if len(r) > 2 else ""
        air_date = r[3] if len(r) > 3 else ""
        
        p_num = Paragraph(f"<b>EP {ep_num}</b>", sub_style)
        p_name = Paragraph(f"<b>{name}</b>", sub_style)
        p_desc = Paragraph(f"{desc}<br/><i>Air Date: {air_date}</i>", sub_style)
        
        table_data.append([p_num, p_name, p_desc])

    t = Table(table_data, colWidths=[50, 180, 310])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t)

    doc.build(story)
    print(f"Successfully generated PDF file: {pdf_file}")

if __name__ == '__main__':
    convert_csv()
