import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Lightbulb, AlertCircle, TrendingUp } from 'lucide-react';

interface AISuggestion {
  level: 'low' | 'moderate' | 'high';
  suggestions: string[];
  analysisBase: string[];
}

interface AISuggestionCardProps {
  suggestion: AISuggestion;
}

export function AISuggestionCard({ suggestion }: AISuggestionCardProps) {
  const [feedback, setFeedback] = useState<'useful' | 'not-useful' | null>(null);

  const levelConfig = {
    low: { label: 'Baixa', color: 'bg-blue-100 text-blue-700', icon: '🔵' },
    moderate: { label: 'Moderada', color: 'bg-yellow-100 text-yellow-700', icon: '🟡' },
    high: { label: 'Alta', color: 'bg-orange-100 text-orange-700', icon: '🟠' }
  };

  const config = levelConfig[suggestion.level];

  const handleFeedback = (type: 'useful' | 'not-useful') => {
    setFeedback(type);
  };

  return (
    <div className="bg-gradient-to-r from-[#F0F9FF] to-[#E0F2FE] rounded-lg border-2 border-[#BAE6FD] p-5 mt-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
          <Lightbulb className="w-5 h-5 text-[#0EA5E9]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-gray-800">💡 Sugestão da IA</h4>
            <span className="text-xs text-gray-500">(assistiva)</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${config.color} flex items-center gap-1`}>
              <span>{config.icon}</span>
              Prioridade {config.label}
            </span>
          </div>
          <p className="text-xs text-gray-600 italic">
            Sugestão gerada com base no histórico do paciente, sinais vitais e eventos recentes. 
            Esta sugestão não substitui avaliação clínica.
          </p>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="bg-white rounded-lg p-4 mb-4 border border-[#BAE6FD]">
        <p className="text-sm text-gray-700 mb-3">
          <strong>Sugestões para Avaliação:</strong>
        </p>
        <ul className="space-y-2">
          {suggestion.suggestions.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-[#0EA5E9] mt-1">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Analysis Base */}
      <div className="bg-white rounded-lg p-4 mb-4 border border-[#BAE6FD]">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-[#0A7EA4]" />
          <p className="text-sm text-gray-700">
            <strong>Base da Análise:</strong>
          </p>
        </div>
        <ul className="space-y-1">
          {suggestion.analysisBase.map((base, index) => (
            <li key={index} className="text-xs text-gray-600 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#0EA5E9] rounded-full"></span>
              {base}
            </li>
          ))}
        </ul>
      </div>

      {/* Feedback Section */}
      <div className="border-t border-[#BAE6FD] pt-4">
        {!feedback ? (
          <div>
            <p className="text-xs text-gray-600 mb-2">Esta sugestão foi útil?</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFeedback('useful')}
                className="px-4 py-2 bg-white border border-[#BAE6FD] rounded-lg text-sm text-gray-700 hover:bg-[#F0F9FF] transition-colors flex items-center gap-2"
              >
                <ThumbsUp className="w-4 h-4" />
                Útil
              </button>
              <button
                onClick={() => handleFeedback('not-useful')}
                className="px-4 py-2 bg-white border border-[#BAE6FD] rounded-lg text-sm text-gray-700 hover:bg-[#F0F9FF] transition-colors flex items-center gap-2"
              >
                <ThumbsDown className="w-4 h-4" />
                Não útil
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 italic">
              Seu feedback ajuda a melhorar as sugestões da IA.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            {feedback === 'useful' ? (
              <>
                <ThumbsUp className="w-4 h-4 text-green-600" />
                <span className="text-green-700">Obrigado! Feedback registrado como útil.</span>
              </>
            ) : (
              <>
                <ThumbsDown className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">Obrigado! Vamos melhorar nossas sugestões.</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-4 flex items-start gap-2 bg-white rounded-lg p-3 border border-[#BAE6FD]">
        <AlertCircle className="w-4 h-4 text-[#0A7EA4] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600">
          <strong>Importante:</strong> As sugestões da IA são assistivas e não substituem o julgamento clínico. 
          A decisão final sobre qualquer ação sempre cabe à equipe médica e de enfermagem.
        </p>
      </div>
    </div>
  );
}