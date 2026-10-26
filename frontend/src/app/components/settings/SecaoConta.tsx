import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, LogOut, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, fetchSecurityPolicy, forceChangePasswordRequest } from '../../data/api';
import { evaluatePasswordPolicy, sanitizeSecurityPolicy, type SecurityPolicy } from '../../data/authStore';
import { Aviso, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CabecalhoSecao, Campo, Cartao, Dado } from './ui';

/**
 * Minha conta: quem está logado e a troca da própria senha.
 *
 * Nome, login e perfil aparecem só para leitura: quem muda é o administrador,
 * em Usuários (trocar o próprio perfil por aqui seria escalar permissão). A
 * troca de senha usa a mesma rota da troca obrigatória, que confere a senha
 * atual no servidor, e mostra as regras da política da clínica enquanto se
 * digita, em vez de só reclamar depois de enviar.
 */
export function SecaoConta() {
  const { user, tenantId, can, logout } = useAuth();
  const [politica, setPolitica] = useState<SecurityPolicy>(() => sanitizeSecurityPolicy(null));

  useEffect(() => {
    // A política exige `settings` para ler. Sem ela valem as regras padrão, e
    // o servidor confere a política verdadeira ao salvar de qualquer jeito.
    if (!tenantId || !can('settings', 'view')) return;
    fetchSecurityPolicy(tenantId)
      .then((p) => setPolitica(sanitizeSecurityPolicy(p)))
      .catch(() => undefined);
  }, [tenantId, can]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <CabecalhoSecao titulo="Minha conta" descricao="Seus dados de acesso, troca de senha e sessão." />

      <Cartao titulo="Dados de acesso" descricao="Para mudar nome, login ou perfil, fale com o administrador da clínica.">
        <div className="flex flex-col gap-5 py-5 sm:flex-row sm:items-center">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marca to-marca-hover text-xl font-medium text-white"
          >
            {user.avatar}
          </div>
          <dl className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Dado rotulo="Nome">{user.name}</Dado>
            <Dado rotulo="Login"><span className="font-mono">{user.login}</span></Dado>
            <Dado rotulo="Perfil">{user.roleLabel}</Dado>
            <Dado rotulo="Clínica"><span className="font-mono">{user.tenantId}</span></Dado>
          </dl>
        </div>
      </Cartao>

      <TrocaDeSenha politica={politica} login={user.login} nome={user.name} tenantId={tenantId} />

      <Cartao titulo="Sessão">
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Por segurança, a sessão termina sozinha após{' '}
            <strong className="text-gray-900">{politica.idleTimeoutMinutes} minutos</strong> sem uso.
            Em computador compartilhado, saia ao terminar o plantão.
          </p>
          <button type="button" onClick={() => logout()} className={`${BOTAO_SECUNDARIO} text-red-700`}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair da conta
          </button>
        </div>
      </Cartao>
    </div>
  );
}

function TrocaDeSenha({ politica, login, nome, tenantId }: {
  politica: SecurityPolicy; login: string; nome: string; tenantId: string | null;
}) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const avaliacao = evaluatePasswordPolicy(nova, { login, name: nome }, politica);
  const confere = confirmacao.length > 0 && confirmacao === nova;
  const igualAtual = nova.length > 0 && nova === atual;
  const podeEnviar = atual.length > 0 && avaliacao.isValid && confere && !igualAtual && !salvando;
  const sujo = atual || nova || confirmacao;

  const regras: { ok: boolean; texto: string; vale: boolean }[] = [
    { ok: avaliacao.checks.hasMinLength, texto: `Pelo menos ${politica.minPasswordLength} caracteres`, vale: true },
    { ok: avaliacao.checks.hasUpper, texto: 'Uma letra maiúscula', vale: politica.requireUppercase },
    { ok: avaliacao.checks.hasLower, texto: 'Uma letra minúscula', vale: politica.requireLowercase },
    { ok: avaliacao.checks.hasNumber, texto: 'Um número', vale: politica.requireNumber },
    { ok: avaliacao.checks.hasSpecial, texto: 'Um caractere especial (!@#…)', vale: politica.requireSpecialChar },
    { ok: !avaliacao.checks.reusesPersonalData, texto: 'Sem seu nome ou login', vale: politica.disallowPersonalData },
    { ok: !avaliacao.checks.inBlocklist, texto: 'Fora da lista de senhas vazadas', vale: true },
  ].filter((r) => r.vale && politica.requireStrongPassword);

  const limpar = () => {
    setAtual('');
    setNova('');
    setConfirmacao('');
    setErro(null);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || !tenantId) return;
    setSalvando(true);
    setErro(null);
    setSucesso(false);
    try {
      await forceChangePasswordRequest({ tenant: tenantId, username: login, currentPassword: atual, newPassword: nova });
      limpar();
      setSucesso(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const tipo = mostrar ? 'text' : 'password';

  return (
    <form onSubmit={enviar} noValidate>
      <Cartao
        titulo="Trocar senha"
        descricao="Use uma senha que você não usa em nenhum outro serviço."
        rodape={
          <>
            <button type="button" onClick={limpar} disabled={!sujo || salvando} className={BOTAO_SECUNDARIO}>Descartar</button>
            <button type="submit" disabled={!podeEnviar} className={BOTAO_PRIMARIO}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {salvando ? 'Salvando…' : 'Trocar senha'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-6 py-5 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            {sucesso && <Aviso tom="sucesso">Senha trocada. Use a nova senha no próximo login.</Aviso>}
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <Campo
              rotulo="Senha atual"
              type={tipo}
              autoComplete="current-password"
              value={atual}
              onChange={(e) => { setAtual(e.target.value); setSucesso(false); }}
            />
            <Campo
              rotulo="Nova senha"
              type={tipo}
              autoComplete="new-password"
              value={nova}
              onChange={(e) => { setNova(e.target.value); setSucesso(false); }}
              erro={igualAtual ? 'A nova senha precisa ser diferente da atual.' : null}
            />
            <Campo
              rotulo="Confirme a nova senha"
              type={tipo}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              erro={confirmacao && !confere ? 'As senhas não são iguais.' : null}
            />
            <button
              type="button"
              onClick={() => setMostrar((m) => !m)}
              className="inline-flex items-center gap-1.5 text-sm text-marca-texto hover:underline"
            >
              {mostrar ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {mostrar ? 'Ocultar senhas' : 'Mostrar senhas'}
            </button>
          </div>

          {regras.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="mb-2 text-sm font-medium text-gray-900">A nova senha precisa ter</p>
              <ul className="space-y-1.5" aria-live="polite">
                {regras.map((r) => {
                  const cumprida = nova.length > 0 && r.ok;
                  return (
                    <li key={r.texto} className={`flex items-center gap-2 text-sm ${cumprida ? 'text-green-700' : 'text-gray-600'}`}>
                      {cumprida
                        ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                        : <X className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
                      <span>{r.texto}<span className="sr-only">{cumprida ? ' — cumprida' : ' — pendente'}</span></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Cartao>
    </form>
  );
}
