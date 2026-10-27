import React, { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import backgroundPattern from "../../assets/login2.png";
import { useSystemToast } from './ui/SystemToast';
import { ApiError, fetchTenants } from '../data/api';
import { PainelDaMarca } from './PainelDaMarca';

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
      .catch((error) => {
        if (error instanceof ApiError) {
          if (error.status === 404) {
            console.warn('[empresa] Endpoint de tenants não encontrado (404). Verifique VITE_API_URL.');
          } else {
            console.error('[empresa] Falha ao carregar tenants', { status: error.status, error });
          }
        } else {
          console.error('[empresa] Falha inesperada ao carregar tenants', error);
        }
        if (mounted) setTenants([]);
        showToast({ message: 'Não foi possível falar com o servidor. Tente de novo em instantes.' });
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeCompany(company);

    if (!normalized) {
      showToast({ message: 'Digite o identificador da clínica.' });
      return;
    }

    const tenant = tenants.find((item) => item.id === normalized);
    if (!tenant) {
      console.warn('[empresa] Tenant não encontrado', { tenant: normalized });
      showToast({ message: 'Clínica não encontrada. Confira o identificador.' });
      return;
    }

    if (!tenant.active) {
      showToast({ message: 'Esta clínica está inativa. Fale com o administrador.' });
      return;
    }

    onContinue(normalized);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-gray-100"
      style={{
        backgroundImage: `url(${backgroundPattern})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="w-full max-w-6xl flex rounded-3xl overflow-hidden shadow-2xl bg-white">
        <PainelDaMarca />

        <div className="w-full lg:w-[45%] bg-white flex flex-col relative overflow-hidden">
          <div className="w-full flex-1 flex items-center justify-center p-8 sm:p-12">
            <div className="w-full max-w-md flex flex-col items-center text-center">
              <div className="mb-6">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-marca to-marca-hover shadow-md" aria-hidden="true">
                <HeartPulse className="h-9 w-9 text-white" />
              </span>
              </div>

              <div className="flex items-center gap-3 mb-7">
                <div className="w-8 h-8 bg-marca rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">1</span>
                </div>
                <h1 className="text-[22px] font-semibold text-slate-800 leading-snug">
                  Encontre sua clínica
                </h1>
              </div>

              <form onSubmit={handleSubmit} className="w-full space-y-4">
                <div className="text-left">
                  <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-gray-800">Identificador da clínica</label>
                  <input
                    id="company"
                    type="text"
                    autoComplete="organization"
                    autoFocus
                    placeholder="ex.: clinica-demo"
                    aria-describedby="company-ajuda"
                    value={company}
                    onChange={(e) => {
                      setCompany(normalizeCompany(e.target.value));
                    }}
                    className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-marca-viva focus:border-transparent transition-all outline-none text-[15px] text-gray-900 placeholder:text-gray-500"
                  />
                  <p id="company-ajuda" className="mt-1.5 text-xs text-gray-600">Quem administra o sistema na sua clínica sabe qual é.</p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-marca hover:bg-marca-hover text-white py-3.5 px-4 rounded-lg font-medium tracking-[0.01em] focus:outline-none focus:ring-2 focus:ring-marca-viva focus:ring-offset-2 transition-all shadow-md"
                >
                  Continuar
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




