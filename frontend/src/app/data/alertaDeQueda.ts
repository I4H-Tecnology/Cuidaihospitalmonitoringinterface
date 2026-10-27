/**
 * Som e notificação do sistema operacional para a queda nova. São reforços do
 * aviso visual, não substitutos: falhar aqui (navegador sem áudio, permissão
 * negada) nunca impede o cartão de aparecer.
 */

let contexto: AudioContext | null = null;

/** Três bipes curtos e agudos, que atravessam o barulho de um posto de enfermagem. */
export async function tocarSomDeQueda(): Promise<boolean> {
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return false;
    contexto ??= new Contexto();
    // O navegador só libera áudio depois de um clique na página; antes disso o
    // contexto fica suspenso e o bipe simplesmente não sai.
    if (contexto.state === 'suspended') await contexto.resume();
    const agora = contexto.currentTime;
    for (let i = 0; i < 3; i++) {
      const oscilador = contexto.createOscillator();
      const ganho = contexto.createGain();
      oscilador.type = 'square';
      oscilador.frequency.value = 880;
      const inicio = agora + i * 0.32;
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.22);
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start(inicio);
      oscilador.stop(inicio + 0.24);
    }
    return contexto.state === 'running';
  } catch {
    return false;
  }
}

export type PermissaoDeNotificacao = NotificationPermission | 'indisponivel';

export function permissaoDeNotificacao(): PermissaoDeNotificacao {
  return typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission;
}

export async function pedirPermissaoDeNotificacao(): Promise<PermissaoDeNotificacao> {
  if (typeof Notification === 'undefined') return 'indisponivel';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Notificação do sistema, só quando a aba não está à vista: com a tela aberta,
 * o próprio cartão de queda já é o aviso.
 */
export function notificarQueda(titulo: string, corpo: string): void {
  if (permissaoDeNotificacao() !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(titulo, { body: corpo, tag: 'medsignal-queda', requireInteraction: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // alguns navegadores só notificam por service worker; o aviso visual segue
  }
}
