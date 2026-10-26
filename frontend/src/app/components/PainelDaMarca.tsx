import { BellRing, HeartPulse, ShieldCheck, Video } from 'lucide-react';

/**
 * Lado esquerdo das telas de entrada (escolha da clínica e login).
 *
 * Era uma imagem com o texto dentro, e o texto ainda dizia "CuidAI", o nome
 * antigo: leitor de tela não lia nada, e a marca não batia com o resto do
 * sistema. Agora é HTML, com a cor de marca do tema escolhido.
 */
export function PainelDaMarca() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-marca to-marca-hover p-12 text-white lg:flex lg:w-[55%]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
          <HeartPulse className="h-7 w-7" aria-hidden="true" />
        </span>
        <div>
          <p className="text-2xl font-semibold">MedSignal</p>
          <p className="text-sm text-white/80">Monitoramento inteligente de quedas</p>
        </div>
      </div>

      <div className="relative">
        <h2 className="text-4xl font-semibold leading-tight">Cada queda vista<br />na hora em que acontece.</h2>
        <ul className="mt-8 space-y-4 text-base text-white/90">
          <li className="flex items-start gap-3"><Video className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />Câmeras analisam os quartos 24 horas por dia.</li>
          <li className="flex items-start gap-3"><BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />O aviso aparece em todas as telas até alguém dar ciência.</li>
          <li className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />Prontuário, equipe e família no mesmo lugar.</li>
        </ul>
      </div>

      <p className="relative text-xs text-white/70">Dados protegidos conforme a LGPD. Acesso registrado e auditável.</p>
    </div>
  );
}
