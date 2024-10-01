'use client';

import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker, PSM } from 'tesseract.js';
import { useState } from 'react';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

function exportToExcel(data: any[]): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, 'sample.xlsx');
}

export default function Page() {
  const [extractedData, setExtractedData] = useState<string[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPdfFile(file);
    }
  };

  const convertPdfToImage = async (pdfFile: ArrayBuffer): Promise<string> => {
    const pdf = await pdfjsLib.getDocument({ data: pdfFile }).promise;
    const page = await pdf.getPage(1);

    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const grayscale = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const inverted = 255 - grayscale;

      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }

    context.putImageData(imageData, 0, 0);
    const imageUrl = canvas.toDataURL('image/png');
    console.log('Generated Image URL:', imageUrl);

    return imageUrl;
  };

  const extractTextFromImage = async (imageUrl: string) => {
    const worker = await createWorker('eng', 1);

    try {
      const {
        data: { text },
      } = await worker.recognize(imageUrl);
      console.log('Full Extracted Text:', text);

      const lines = text.split('\n');

      lines.forEach((line, index) => {
        console.log(`Line ${index + 1}:`, line);
      });

      const filteredText = lines.map((line) => {
        const columns = line.split(/[\s,]+/);
        console.log('Columns after split:', columns);

        return {
          clientName: columns[0] || '',
          projectAddress: columns[1] || '',
          timeIn: columns[2] || '',
          timeOut: columns[3] || '',
        };
      });

      setExtractedData(
        filteredText.map(
          (row) =>
            `${row.clientName}, ${row.projectAddress}, ${row.timeIn}, ${row.timeOut}`,
        ),
      );
    } catch (error) {
      console.error('Error recognizing image:', error);
    } finally {
      await worker.terminate();
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!pdfFile) {
      alert('Please upload a PDF file first.');
      return;
    }

    try {
      const fileReader = new FileReader();
      fileReader.onload = async () => {
        const pdfArrayBuffer = fileReader.result as ArrayBuffer;
        const imageUrl = await convertPdfToImage(pdfArrayBuffer);
        await extractTextFromImage(imageUrl);
      };
      fileReader.readAsArrayBuffer(pdfFile);
    } catch (error) {
      console.error('Error processing PDF:', error);
    }
  };

  const handleExportToExcel = (): void => {
    const data = extractedData.map((line, index) => ({
      name: line.split(',')[0],
      address: line.split(',')[1],
      timeIn: line.split(',')[2],
      timeOut: line.split(',')[3],
    }));
    exportToExcel(data);
  };

  return (
    <>
      <div className="flex flex-col m-4">
        <div className="flex justify-center gap-4 my-10">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="p-2"
          />
          <button
            onClick={handleSubmit}
            className="bg-slate-100 hover:bg-slate-200 text-black rounded-md p-2"
          >
            Submit
          </button>
          <button
            onClick={handleExportToExcel}
            className="bg-slate-100 hover:bg-slate-200 text-black rounded-md p-2"
          >
            Export to Excel
          </button>
        </div>

        {extractedData.length > 0 && (
          <div className="mt-4 p-4 border border-slate-300">
            <h3 className="text-lg font-bold">Extracted Text:</h3>
            {extractedData.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
