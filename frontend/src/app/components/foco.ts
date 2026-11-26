/**
 * Ref que leva o foco ao elemento no instante em que ele entra na tela.
 *
 * Usar só em campo que aparece por ação do usuário (abrir "Registrar", clicar
 * em "Nova evolução"): o foco acompanha o que a pessoa acabou de pedir. Em
 * página que simplesmente carrega, o foco automático desorienta quem usa leitor
 * de tela (SonarQube S9379); nesses casos, não use.
 *
 * É uma função de módulo, de identidade estável: o React só a chama ao montar
 * e ao desmontar o campo, não a cada renderização (um `ref={(el) => ...}` em
 * linha roubaria o foco a cada tecla digitada).
 */
export const focarAoAparecer = (elemento: HTMLElement | null): void => {
  elemento?.focus();
};
