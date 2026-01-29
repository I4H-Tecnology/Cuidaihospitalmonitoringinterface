import React, { useEffect, useState } from 'react';
import logoImage from "../../assets/logo.png";
import sideImage from "../../assets/login1.png";
import backgroundPattern from "../../assets/login2.png";
import { useSystemToast } from './ui/SystemToast';
import { fetchTenants } from '../data/api';

interface CompanySelectScreenProps {
  onContinue: (tenant: string) => void;
}

export function CompanySelectScreen({ onContinue }: CompanySelectScreenProps) {
  const [company, setCompany] = useState('');
  const [tenants, setTenants] = useState<Array<{ id: string; active: boolean }>>([]);
  const { showToast } = useSystemToast();

  const normalizeCompany = (value: string) => {
    return value.toLowerCase().replace(/\s+/g, '');
  };

  useEffect(() => {
    let mounted = true;
    fetchTenants()
      .then((data) => {
        if (mounted) setTenants(data);
      })
      .catch(() => {
        if (mounted) setTenants([]);
        showToast({ message: 'Não foi possível carregar as empresas.' });
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeCompany(company);

    if (!normalized) {
      showToast({ message: 'Digite sua empresa' });
      return;
    }

    const tenant = tenants.find((item) => item.id === normalized);
    if (!tenant) {
      showToast({ message: 'Empresa não encontrada' });
      return;
    }

    if (!tenant.active) {
      showToast({ message: 'Empresa inativa. Fale com o administrador.' });
      return;
    }

    onContinue(normalized);
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
      <div className="w-full max-w-6xl flex rounded-3xl overflow-hidden shadow-2xl bg-white">
        <div className="hidden lg:flex lg:w-[60%] bg-[#E8F4F8] items-center justify-center">
          <img
            src={sideImage}
            alt="CuidAI - Monitore Inteligentemente o seu Hospital"
            className="w-full h-auto object-contain"
          />
        </div>

        <div className="w-full lg:w-[40%] bg-white flex flex-col relative overflow-hidden">
          <div className="w-full flex-1 flex items-center justify-center p-12">
            <div className="w-full max-w-md flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                <img
                  src={logoImage}
                  alt="CuidAI"
                  className="h-16 w-16 object-contain"
                />
              </div>

              <div className="flex items-center gap-3 mb-7">
                <div className="w-8 h-8 bg-[#0EA5E9] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">1</span>
                </div>
                <h1 className="text-[22px] font-semibold text-slate-800 leading-snug">
                  Encontre sua empresa
                </h1>
              </div>

              <form onSubmit={handleSubmit} className="w-full space-y-4">
                <div>
                  <input
                    id="company"
                    type="text"
                    placeholder="Empresa"
                    value={company}
                    onChange={(e) => {
                      setCompany(normalizeCompany(e.target.value));
                    }}
                    className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all outline-none text-[15px] text-gray-900 placeholder:text-gray-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#6EC1E4] hover:bg-[#4DA3FF] text-white py-3.5 px-4 rounded-lg font-medium tracking-[0.01em] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:ring-offset-2 transition-all shadow-md"
                >
                  Proximo passo
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
