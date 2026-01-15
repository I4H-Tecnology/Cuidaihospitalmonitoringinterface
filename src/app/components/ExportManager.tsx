import React, { useState } from 'react';
import { Download, FileText, Table as TableIcon, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ExportManagerProps {
  isOpen: boolean;
  onClose: () => void;
  data: any[];
  filename: string;
  title?: string;
  columns?: Array<{ header: string; key: string }>;
}

export function ExportManager({ isOpen, onClose, data, filename, title, columns }: ExportManagerProps) {
  const { isDarkMode } = useTheme();
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  const exportToPDF = () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.text(title || 'Relatório CuidAI', 14, 22);
      
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
      
      // Table
      const tableColumns = columns?.map(col => col.header) || Object.keys(data[0] || {});
      const tableRows = data.map(row => 
        columns?.map(col => row[col.key]) || Object.values(row)
      );
      
      autoTable(doc, {
        head: [tableColumns],
        body: tableRows,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [14, 165, 233], textColor: 255 }
      });
      
      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.text(
          `Página ${i} de ${pageCount} - CuidAI © ${new Date().getFullYear()}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }
      
      doc.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = () => {
    setExporting(true);
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
      
      // Column widths
      const maxWidth = 50;
      const wscols = columns?.map(() => ({ wch: maxWidth })) || 
                     Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
      worksheet['!cols'] = wscols;
      
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Erro ao exportar Excel. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
    } catch (error) {
      console.error('Erro ao exportar CSV:', error);
      alert('Erro ao exportar CSV. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] rounded-lg shadow-2xl z-50 ${
        isDarkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className={`w-5 h-5 ${isDarkMode ? 'text-cyan-400' : 'text-[#0EA5E9]'}`} />
              <h2 className={isDarkMode ? 'text-white' : 'text-gray-800'}>
                Exportar Dados
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`p-1 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Arquivo: <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{filename}</span>
            </p>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Registros: <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{data.length}</span>
            </p>
          </div>

          <div className="space-y-3">
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Escolha o formato de exportação:
            </p>

            {/* PDF Button */}
            <button
              onClick={exportToPDF}
              disabled={exporting}
              className={`w-full p-4 rounded-lg border-2 transition-all flex items-center justify-between ${
                exporting
                  ? isDarkMode
                    ? 'bg-gray-800 border-gray-700 cursor-not-allowed'
                    : 'bg-gray-100 border-gray-200 cursor-not-allowed'
                  : isDarkMode
                    ? 'bg-gray-800 border-gray-700 hover:border-cyan-600 hover:bg-gray-750'
                    : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  isDarkMode ? 'bg-red-900/30' : 'bg-red-100'
                }`}>
                  <FileText className={`w-6 h-6 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                </div>
                <div className="text-left">
                  <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    Exportar como PDF
                  </p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Documento formatado e pronto para impressão
                  </p>
                </div>
              </div>
              <Download className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            </button>

            {/* Excel Button */}
            <button
              onClick={exportToExcel}
              disabled={exporting}
              className={`w-full p-4 rounded-lg border-2 transition-all flex items-center justify-between ${
                exporting
                  ? isDarkMode
                    ? 'bg-gray-800 border-gray-700 cursor-not-allowed'
                    : 'bg-gray-100 border-gray-200 cursor-not-allowed'
                  : isDarkMode
                    ? 'bg-gray-800 border-gray-700 hover:border-cyan-600 hover:bg-gray-750'
                    : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  isDarkMode ? 'bg-green-900/30' : 'bg-green-100'
                }`}>
                  <TableIcon className={`w-6 h-6 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <div className="text-left">
                  <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    Exportar como Excel
                  </p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Planilha editável (.xlsx) com dados completos
                  </p>
                </div>
              </div>
              <Download className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            </button>

            {/* CSV Button */}
            <button
              onClick={exportToCSV}
              disabled={exporting}
              className={`w-full p-4 rounded-lg border-2 transition-all flex items-center justify-between ${
                exporting
                  ? isDarkMode
                    ? 'bg-gray-800 border-gray-700 cursor-not-allowed'
                    : 'bg-gray-100 border-gray-200 cursor-not-allowed'
                  : isDarkMode
                    ? 'bg-gray-800 border-gray-700 hover:border-cyan-600 hover:bg-gray-750'
                    : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  isDarkMode ? 'bg-blue-900/30' : 'bg-blue-100'
                }`}>
                  <TableIcon className={`w-6 h-6 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <div className="text-left">
                  <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    Exportar como CSV
                  </p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Formato universal compatível com qualquer sistema
                  </p>
                </div>
              </div>
              <Download className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            onClick={onClose}
            className={`w-full px-4 py-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
