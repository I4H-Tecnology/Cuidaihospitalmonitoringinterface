import { emailValido } from '../data/texto';
import React, { useState } from 'react';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import logoImage from '@/assets/logo.png';
import { requestForgotPassword, resetForgotPassword } from '../data/api';
import { useSystemToast } from './ui/SystemToast';

interface ForgotPasswordScreenProps {
  onBack: () => void;
}

export function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps) {
  const { showToast } = useSystemToast();
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [devCode, setDevCode] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [isLoading, setIsLoading] = useState(false);
  const tenant = localStorage.getItem('tenant');

  const handleRequest = async () => {
    if (!tenant) {
      showToast({ message: 'Selecione a empresa para continuar.' });
      return;
    }
    if (!identifier.trim()) {
      showToast({ message: 'Informe seu e-mail.' });
      return;
    }
    const email = identifier.trim().toLowerCase();
    if (!emailValido(email)) {
      showToast({ message: 'Informe um e-mail válido.' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await requestForgotPassword({
        tenant,
        email
      });
      setDevCode(result.devResetCode || '');
      setStep('reset');
      showToast({ message: 'Se o cadastro existir, enviamos instruções para seu e-mail.' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'Não foi possível iniciar recuperação.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!tenant) {
      showToast({ message: 'Selecione a empresa para continuar.' });
      return;
    }
    if (!code.trim() || !newPassword) {
      showToast({ message: 'Informe o código e a nova senha.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast({ message: 'As senhas não conferem.' });
      return;
    }
    setIsLoading(true);
    try {
      await resetForgotPassword({ tenant, email: identifier.trim().toLowerCase(), code: code.trim(), newPassword });
      showToast({ message: 'Senha redefinida com sucesso.' });
      onBack();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'Não foi possível redefinir a senha.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FA] flex items-center justify-center px-4">
      <div className="w-full max-w-[560px] bg-transparent">
        <div className="text-center mb-10">
          <div className="mx-auto w-[88px] h-[88px] rounded-2xl bg-marca-suave flex items-center justify-center shadow-sm mb-4">
            <img src={logoImage} alt="" className="h-12 w-auto" />
          </div>
          <h1 className="text-[44px] leading-none font-bold text-[#0F2A4D] mb-2">MedSignal</h1>
          <p className="text-[#4D688B]">Sistema Hospitalar Inteligente</p>
        </div>

        <div className="bg-white/60 border border-[#E5EDF6] rounded-2xl p-8 shadow-sm">
          <h2 className="text-4xl font-semibold text-[#0F2A4D] text-center mb-2">Esqueceu a sua senha?</h2>
          <p className="text-center text-[#5F7697] mb-8">
            Insira abaixo o seu e-mail para recuperar a sua senha
          </p>

          <div className="space-y-4">
            <label htmlFor="forgotpasswordscreen-e-mail" className="block text-[#304A6E]">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5F7697]" />
              <input id="forgotpasswordscreen-e-mail"
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={step === 'reset' || isLoading}
                placeholder="seu@email.com"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-[#C8D7E8] bg-white text-[#1B3556] focus:outline-none focus:ring-2 focus:ring-marca-clara"
              />
            </div>

            {step === 'reset' && (
              <>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de recuperação"
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-xl border border-[#C8D7E8] bg-white text-[#1B3556] focus:outline-none focus:ring-2 focus:ring-marca-clara"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha"
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-xl border border-[#C8D7E8] bg-white text-[#1B3556] focus:outline-none focus:ring-2 focus:ring-marca-clara"
                />
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirmar nova senha"
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-xl border border-[#C8D7E8] bg-white text-[#1B3556] focus:outline-none focus:ring-2 focus:ring-marca-clara"
                />
                {devCode && (
                  <p className="text-xs text-amber-700">Ambiente dev: código gerado {devCode}</p>
                )}
              </>
            )}

            <button
              type="button"
              disabled={isLoading}
              onClick={step === 'request' ? handleRequest : handleReset}
              className="w-full mt-2 py-3 rounded-xl bg-marca hover:bg-marca-hover text-white font-semibold transition-colors shadow-md disabled:opacity-70"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {step === 'request' ? 'Enviando...' : 'Salvando...'}
                </span>
              ) : step === 'request' ? (
                'Enviar'
              ) : (
                'Redefinir senha'
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 text-marca-texto hover:text-marca-texto font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  );
}
