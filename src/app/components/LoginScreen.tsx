import React, { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSystemToast } from './ui/SystemToast';
import { forceChangePasswordRequest, requestForgotPassword } from '../data/api';
import logoImage from '@/assets/logo.png';
import sideImage from '@/assets/login1.png';
import backgroundPattern from '@/assets/login2.png';

const normalizeCpf = (value: string) => value.replace(/\D/g, '');

export function LoginScreen() {
  const { login } = useAuth();
  const { showToast } = useSystemToast();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showFirstAccessModal, setShowFirstAccessModal] = useState(false);
  const [firstAccessUsername, setFirstAccessUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isFirstAccessLoading, setIsFirstAccessLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ username: false, password: false });
  const tenant = localStorage.getItem('tenant');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const nextErrors = {
      username: !trimmedUsername,
      password: !password
    };
    setFieldErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) return;

    setIsLoading(true);
    const result = await login(trimmedUsername, password);

    if (!result.success) {
      if (result.requiresPasswordChange) {
        showToast({ variant: 'warning', message: result.error || 'Troca obrigatória de senha.' });
        setFirstAccessUsername(trimmedUsername);
        setShowFirstAccessModal(true);
      } else {
        showToast({ message: result.error || 'Não foi possível entrar. Verifique seus dados.' });
      }
      setIsLoading(false);
      return;
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) {
      showToast({ message: 'Selecione a empresa para continuar.' });
      return;
    }
    if (!forgotIdentifier.trim()) {
      showToast({ message: 'Informe seu e-mail ou CPF.' });
      return;
    }
    setIsLoading(true);
    try {
      const payload = normalizeCpf(forgotIdentifier).length >= 11 ? normalizeCpf(forgotIdentifier) : forgotIdentifier.trim();
      await requestForgotPassword({
        tenant,
        loginOrEmail: payload
      });
      showToast({ message: 'Se o cadastro existir, enviaremos instruções para o e-mail cadastrado.' });
      setMode('login');
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'Não foi possível solicitar recuperação.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFirstAccessChange = async () => {
    if (!tenant) {
      showToast({ message: 'Selecione a empresa para continuar.' });
      return;
    }
    if (!firstAccessUsername || !password || !newPassword) {
      showToast({ message: 'Preencha login, senha atual e nova senha.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast({ message: 'As senhas não conferem.' });
      return;
    }

    setIsFirstAccessLoading(true);
    try {
      await forceChangePasswordRequest({
        tenant,
        username: firstAccessUsername,
        currentPassword: password,
        newPassword
      });
      showToast({ message: 'Senha alterada. Faça login novamente com a nova senha.' });
      setShowFirstAccessModal(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'Não foi possível alterar a senha.' });
    } finally {
      setIsFirstAccessLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8 bg-gray-100"
      style={{
        backgroundImage: `url(${backgroundPattern})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="w-full max-w-6xl flex rounded-3xl overflow-hidden shadow-2xl">
        <div className="hidden lg:flex lg:w-[60%] bg-[#E8F4F8] items-center justify-center">
          <img
            src={sideImage}
            alt="MedSignal - Monitore Inteligentemente o seu Hospital"
            className="w-full h-auto object-contain"
          />
        </div>

        <div className="w-full lg:w-[40%] bg-white flex items-center justify-center p-12">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              <img src={logoImage} alt="MedSignal" className="h-16 w-auto mb-3" />
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">MedSignal</h2>
                <p className="text-xs text-gray-500">Sistema Hospitalar Inteligente</p>
              </div>
            </div>

            {mode === 'login' ? (
              <>
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-[#0EA5E9] rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">2</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">Login e senha</h1>
                  </div>
                  <p className="text-sm text-gray-600 ml-11">Insira seu login e senha abaixo</p>
                  {tenant && (
                    <p className="text-xs text-gray-500 ml-11 mt-2">
                      Tenant ativo: <span className="font-semibold text-gray-700">{tenant}</span>
                    </p>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                      Nome do usuario
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: false }));
                      }}
                      className={`block w-full px-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900 ${
                        fieldErrors.username ? 'border-[#EF4444]' : 'border-gray-300'
                      }`}
                      disabled={isLoading}
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Senha
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: false }));
                      }}
                      className={`block w-full px-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900 ${
                        fieldErrors.password ? 'border-[#EF4444]' : 'border-gray-300'
                      }`}
                      disabled={isLoading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#0EA5E9] hover:bg-[#0284C7] text-white py-3.5 px-4 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Entrando...</span>
                      </>
                    ) : (
                      <span>Entrar</span>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-sm text-[#0EA5E9] hover:text-[#0284C7] font-medium transition-colors"
                    >
                      Esqueceu a sua senha?
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Esqueceu a sua senha?</h1>
                  <p className="text-sm text-gray-600">Insira abaixo o seu e-mail ou CPF para recuperar a sua senha</p>
                </div>

                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="forgot" className="block text-sm font-medium text-gray-700 mb-2">
                      E-mail ou CPF
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        id="forgot"
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        className="block w-full pl-11 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-gray-900"
                        placeholder="seu@email.com ou 000.000.000-00"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#7DD3FC] hover:bg-[#55C0F5] text-[#0F2A4D] py-3.5 px-4 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#7DD3FC] focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <span>Enviar</span>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-sm text-[#0EA5E9] hover:text-[#0284C7] font-medium transition-colors"
                    >
                      Voltar para o login
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {showFirstAccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Troca obrigatória de senha</h3>
                <p className="text-xs text-gray-500 mt-1">Defina uma nova senha para concluir o primeiro acesso.</p>
              </div>
              <button type="button" onClick={() => setShowFirstAccessModal(false)} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Login</label>
                <input
                  type="text"
                  value={firstAccessUsername}
                  onChange={(e) => setFirstAccessUsername(e.target.value)}
                  disabled={isFirstAccessLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isFirstAccessLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  disabled={isFirstAccessLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowFirstAccessModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFirstAccessChange}
                disabled={isFirstAccessLoading}
                className="px-4 py-2 text-sm bg-[#0EA5E9] text-white rounded-lg hover:bg-[#0284C7] disabled:opacity-60"
              >
                {isFirstAccessLoading ? 'Salvando...' : 'Alterar senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
