"""As tabelas oficiais de 2026, no mesmo formato gravado em `tabela_fiscal`.

Duplicadas aqui (e não lidas do SQL) de propósito: se alguém mexer num número
da migração, o teste que confere o cálculo contra a conta feita à mão continua
usando o valor oficial e acusa a diferença.

INSS: Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026.
IRRF: Lei nº 15.191/2025 (tabela) e Lei nº 15.270/2025 (redução), conforme
      a página "Tributação de 2026" da Receita Federal.
"""

INSS_2026 = {
    "faixas": [
        {"ate": "1621.00", "aliquota": "7.5"},
        {"ate": "2902.84", "aliquota": "9"},
        {"ate": "4354.27", "aliquota": "12"},
        {"ate": "8475.55", "aliquota": "14"},
    ],
    "aliquota_contribuinte_individual": "11",
}

IRRF_2026 = {
    "faixas": [
        {"ate": "2428.80", "aliquota": "0", "deducao": "0"},
        {"ate": "2826.65", "aliquota": "7.5", "deducao": "182.16"},
        {"ate": "3751.05", "aliquota": "15", "deducao": "394.16"},
        {"ate": "4664.68", "aliquota": "22.5", "deducao": "675.49"},
        {"ate": None, "aliquota": "27.5", "deducao": "908.73"},
    ],
    "deducao_dependente": "189.59",
    "desconto_simplificado": "607.20",
    "reducoes": [
        {"ate": "5000.00", "tipo": "fixa", "valor": "312.89"},
        {"ate": "7350.00", "tipo": "linear", "a": "978.62", "b": "0.133145"},
    ],
    "dispensa_retencao_ate": "10.00",
}
