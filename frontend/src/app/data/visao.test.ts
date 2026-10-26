import { describe, expect, it } from 'vitest';
import { VISAO_URL, diagnosticarCaptura, formatarBytes, formatarDuracao, urlDoVideoAoVivo } from './visao';
import type { Captura } from './visao';

const captura = (parcial: Partial<Captura>): Captura => ({
  estado: 'capturando',
  tentativa: 0,
  proxima_tentativa_em_s: null,
  ultimo_quadro_ha_s: 0.1,
  reconexoes: 0,
  quedas_da_fonte: 0,
  erro: null,
  ...parcial,
});

describe('diagnosticarCaptura: serviço fora do ar vs câmera fora do ar', () => {
  it('sem alcançar a porta 8001, o problema é o serviço', () => {
    expect(diagnosticarCaptura(false, captura({ estado: 'reconectando' }))).toEqual({ tipo: 'servico-fora' });
  });

  it('serviço no ar e fonte reconectando é a câmera, com tentativa e próxima espera', () => {
    const d = diagnosticarCaptura(
      true,
      captura({ estado: 'reconectando', tentativa: 3, proxima_tentativa_em_s: 4, erro: 'Não foi possível abrir o arquivo' }),
    );
    expect(d).toEqual({ tipo: 'camera-fora', tentativa: 3, proximaEmS: 4, erro: 'Não foi possível abrir o arquivo' });
  });

  it('capturando é ok', () => {
    expect(diagnosticarCaptura(true, captura({}))).toEqual({ tipo: 'ok' });
  });

  it('antes da primeira resposta, está iniciando', () => {
    expect(diagnosticarCaptura(null, null)).toEqual({ tipo: 'iniciando' });
  });

  it('serviço antigo, sem o bloco de captura, é tratado como ok', () => {
    expect(diagnosticarCaptura(true, undefined)).toEqual({ tipo: 'ok' });
  });

  it('parado e iniciando têm diagnóstico próprio', () => {
    expect(diagnosticarCaptura(true, captura({ estado: 'parado' }))).toEqual({ tipo: 'parado' });
    expect(diagnosticarCaptura(true, captura({ estado: 'iniciando' }))).toEqual({ tipo: 'iniciando' });
  });
});

describe('formatação para a tela de saúde', () => {
  it('duração em segundos, minutos, horas e dias', () => {
    expect(formatarDuracao(null)).toBe('—');
    expect(formatarDuracao(42)).toBe('42 s');
    expect(formatarDuracao(125)).toBe('2 min');
    expect(formatarDuracao(3600 * 2 + 300)).toBe('2h 05min');
    expect(formatarDuracao(3600 * 26)).toBe('1d 2h');
  });

  it('bytes legíveis', () => {
    expect(formatarBytes(null)).toBe('—');
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(20 * 1024)).toBe('20 KB');
    expect(formatarBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('urlDoVideoAoVivo: um processo de visão por câmera', () => {
  it('o endereço cadastrado na câmera vence', () => {
    expect(urlDoVideoAoVivo({ id: 'c1', visaoUrl: 'http://localhost:8002' }, 'c1')).toBe('http://localhost:8002');
  });

  it('sem cadastro, usa o serviço padrão se for esta a câmera que ele observa', () => {
    expect(urlDoVideoAoVivo({ id: 'c1', visaoUrl: null }, 'c1')).toBe(VISAO_URL);
  });

  it('sem cadastro e o padrão observando outra câmera, não há vídeo: nunca o de outro quarto', () => {
    expect(urlDoVideoAoVivo({ id: 'c2' }, 'c1')).toBeNull();
  });

  it('sem cadastro e o padrão fora do ar, não há vídeo', () => {
    expect(urlDoVideoAoVivo({ id: 'c1' }, null)).toBeNull();
  });
});
