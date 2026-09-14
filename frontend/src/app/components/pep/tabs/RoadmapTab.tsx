import { Activity, FlaskConical, Upload } from 'lucide-react';
import { AvisoForaDoMVP } from '../ForaDoMVP';

/**
 * O que o prontuário ainda não faz, numa lista só.
 *
 * Eram seis abas, cada uma com o seu mock e o seu aviso de "visão de
 * produto", dizendo a mesma coisa seis vezes. Evoluções e linha do tempo
 * saíram desta lista em 13/09/2026, quando viraram dado real; o que resta
 * ainda não tem entidade no modelo de dados.
 */

const ITENS = [
  {
    Icone: Activity,
    titulo: 'Sinais vitais',
    detalhe: 'Frequência cardíaca, temperatura e saturação. Dependem de sensor que o produto não tem; a câmera detecta queda, não mede sinal vital.',
  },
  {
    Icone: FlaskConical,
    titulo: 'Exames',
    detalhe: 'Solicitação e resultado de exame. Sem entidade no modelo de dados.',
  },
  {
    Icone: Upload,
    titulo: 'Documentos',
    detalhe: 'Upload de documento do paciente. Sem entidade no modelo de dados.',
  },
];

export function RoadmapTab() {
  return (
    <div>
      <AvisoForaDoMVP oque="O prontuário clínico completo" />
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {ITENS.map(({ Icone, titulo, detalhe }) => (
          <li key={titulo} className="flex items-start gap-3 px-5 py-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
              <Icone className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm text-gray-800">{titulo}</p>
              <p className="text-xs text-gray-500">{detalhe}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-500">
        O que já existe de verdade neste prontuário: cadastro, ambiente, ocorrências detectadas pelas
        câmeras, ciclo de atendimento, alta, evoluções, linha do tempo, alergias e riscos, medicações,
        histórico médico, médico responsável e acompanhantes.
        Nada acima tem dado de exemplo.
      </p>
    </div>
  );
}
