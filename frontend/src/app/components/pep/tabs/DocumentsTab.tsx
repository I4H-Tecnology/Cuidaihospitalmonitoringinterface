import React from 'react';
import { FileText, Download, Eye, Upload, Trash2, File } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
}

interface DocumentsTabProps {
  patient: Patient;
}

interface Document {
  id: number;
  name: string;
  type: 'term' | 'report' | 'pdf' | 'image' | 'other';
  uploadDate: string;
  uploadedBy: string;
  size: string;
  category: string;
}

const mockDocuments: Document[] = [
  {
    id: 1,
    name: 'Termo de Consentimento - Internação',
    type: 'term',
    uploadDate: '20/12/2024 08:30',
    uploadedBy: 'Recepção - Ana Silva',
    size: '245 KB',
    category: 'Termos de Consentimento'
  },
  {
    id: 2,
    name: 'Relatório de Admissão',
    type: 'report',
    uploadDate: '20/12/2024 09:00',
    uploadedBy: 'Dr. Carlos Silva',
    size: '180 KB',
    category: 'Relatórios Médicos'
  },
  {
    id: 3,
    name: 'Resultado Ecocardiograma - 15/12/2024',
    type: 'pdf',
    uploadDate: '20/12/2024 14:30',
    uploadedBy: 'Setor de Imagem',
    size: '1.2 MB',
    category: 'Exames de Imagem'
  },
  {
    id: 4,
    name: 'Raio-X Tórax PA e Perfil',
    type: 'image',
    uploadDate: '21/12/2024 10:00',
    uploadedBy: 'Radiologia',
    size: '856 KB',
    category: 'Exames de Imagem'
  },
  {
    id: 5,
    name: 'Prescrição Médica Anterior',
    type: 'pdf',
    uploadDate: '20/12/2024 08:45',
    uploadedBy: 'Dr. Carlos Silva',
    size: '124 KB',
    category: 'Prescrições'
  },
  {
    id: 6,
    name: 'Termo LGPD - Tratamento de Dados',
    type: 'term',
    uploadDate: '20/12/2024 08:30',
    uploadedBy: 'Recepção - Ana Silva',
    size: '198 KB',
    category: 'Termos de Consentimento'
  }
];

export function DocumentsTab({ patient }: DocumentsTabProps) {
  const typeConfig = {
    term: { icon: '📋', label: 'Termo', color: 'text-blue-600' },
    report: { icon: '📊', label: 'Relatório', color: 'text-purple-600' },
    pdf: { icon: '📄', label: 'PDF', color: 'text-red-600' },
    image: { icon: '🖼️', label: 'Imagem', color: 'text-green-600' },
    other: { icon: '📎', label: 'Outro', color: 'text-gray-600' }
  };

  // Group documents by category
  const categories = Array.from(new Set(mockDocuments.map(doc => doc.category)));
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">Documentos do Paciente</h2>
          <p className="text-sm text-gray-500">{mockDocuments.length} documentos anexados</p>
        </div>
        <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload Documento
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {Object.entries(typeConfig).map(([key, config]) => {
          const count = mockDocuments.filter(doc => doc.type === key).length;
          if (count === 0) return null;
          
          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{config.icon}</span>
                <span className={`text-xs ${config.color}`}>{config.label}</span>
              </div>
              <p className="text-2xl text-gray-800">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Documents by Category */}
      {categories.map(category => {
        const categoryDocs = mockDocuments.filter(doc => doc.category === category);
        
        return (
          <div key={category}>
            <h3 className="text-gray-800 mb-3">{category}</h3>
            
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-100">
                {categoryDocs.map(doc => {
                  const config = typeConfig[doc.type];
                  
                  return (
                    <div key={doc.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          {/* Icon */}
                          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                            {config.icon}
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-gray-800">{doc.name}</h4>
                              <span className={`text-xs ${config.color}`}>{config.label}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span>📅 {doc.uploadDate}</span>
                              <span>👤 {doc.uploadedBy}</span>
                              <span>📦 {doc.size}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button 
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Visualizar"
                          >
                            <Eye className="w-5 h-5 text-gray-600" />
                          </button>
                          <button 
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Baixar"
                          >
                            <Download className="w-5 h-5 text-gray-600" />
                          </button>
                          <button 
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-5 h-5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
