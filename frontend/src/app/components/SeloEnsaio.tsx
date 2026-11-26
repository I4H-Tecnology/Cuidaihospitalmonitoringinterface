/**
 * Selo de registro de ENSAIO CONTROLADO: uma ocorrência que o detector classificou num teste do
 * autor com a webcam do notebook e que foi trazida à demonstração em produção, onde não há câmera.
 * Não é detecção ao vivo, não mede desempenho e não houve atendimento real.
 *
 * Um componente só, para o aviso ser o mesmo em todo lugar que lista ocorrências. O texto da
 * observação (gravado pelo servidor) detalha; o selo garante que ninguém precise ler para saber.
 */
export function SeloEnsaio() {
  return (
    <span
      className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-950"
      title="Registro de teste do autor, gravado com a webcam do notebook. Não é detecção ao vivo em produção, não mede desempenho e não houve atendimento real."
    >
      ENSAIO CONTROLADO
    </span>
  );
}
