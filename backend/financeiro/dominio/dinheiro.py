"""Dinheiro: Decimal com duas casas, nunca float.

Float não representa 0,10 exatamente — somar mil lançamentos de 0,10 em float
dá 99,99999999999986. Em financeiro isso vira centavo sumindo no fechamento, e
centavo sumindo é conta que não bate com o extrato do banco.

Duas regras valem no módulo inteiro:

  1. Valor monetário entra como texto ou Decimal. Float é recusado na porta.
  2. Arredonda uma vez, no fim da conta, pela regra comercial (meio para cima),
     que é a de boleto, nota fiscal e folha. Arredondar cada passo acumula erro:
     a tabela do INSS 2026 só fecha no desconto máximo oficial (R$ 988,09)
     somando as faixas sem arredondar e arredondando o total.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, InvalidOperation

CENTAVO = Decimal("0.01")
ZERO = Decimal("0.00")
CEM = Decimal("100")


class ValorInvalido(ValueError):
    pass


def dinheiro(valor) -> Decimal:
    """Converte str, int ou Decimal em Decimal de duas casas.

    >>> dinheiro("10.005")
    Decimal('10.01')
    """
    if isinstance(valor, bool) or isinstance(valor, float):
        # bool é int em Python; aceitar True como 1,00 seria um bug silencioso.
        raise TypeError("Valor monetário deve vir como texto ou Decimal, nunca float ou bool.")
    if valor is None:
        raise ValorInvalido("Valor monetário ausente.")
    try:
        numero = Decimal(str(valor).strip())
    except InvalidOperation as exc:
        raise ValorInvalido(f"Valor monetário inválido: {valor!r}.") from exc
    if not numero.is_finite():
        raise ValorInvalido(f"Valor monetário inválido: {valor!r}.")
    return arredondar(numero)


def arredondar(valor: Decimal, casas: Decimal = CENTAVO) -> Decimal:
    """Arredondamento comercial: 0,005 vira 0,01."""
    return Decimal(valor).quantize(casas, rounding=ROUND_HALF_UP)


def percentual_de(valor, percentual) -> Decimal:
    """`percentual`% de `valor`, arredondado. percentual_de(1000, 7.5) -> 75,00."""
    return arredondar(Decimal(str(valor)) * Decimal(str(percentual)) / CEM)


def dividir_em_parcelas(total, quantidade: int) -> list[Decimal]:
    """Divide sem perder centavo.

    As parcelas saem iguais e a sobra do arredondamento vai para a PRIMEIRA:
    100,00 em 3 vira 33,34 + 33,33 + 33,33. Na primeira porque é a que a pessoa
    confere na hora de lançar; as seguintes ficam iguais, que é o que ela espera
    ver no carnê.
    """
    if quantidade < 1:
        raise ValorInvalido("A quantidade de parcelas deve ser pelo menos 1.")
    total = dinheiro(total)
    base = (total / quantidade).quantize(CENTAVO, rounding=ROUND_DOWN)
    sobra = total - base * quantidade
    parcelas = [base] * quantidade
    parcelas[0] += sobra
    return parcelas


def ratear(total, pesos) -> list[Decimal]:
    """Distribui `total` na proporção dos pesos, somando exatamente o total.

    Método do maior resto, em centavos: cada parte recebe o piso da sua cota e
    os centavos que sobram vão, um a um, para as maiores frações. Serve para
    repartir um pagamento entre as categorias do título, ou uma guia de imposto
    entre os centros de custo, sem o total rateado diferir do pago.
    """
    total = dinheiro(total)
    pesos = [Decimal(str(p)) for p in pesos]
    if not pesos:
        raise ValorInvalido("Nada para ratear.")
    if any(p < 0 for p in pesos):
        raise ValorInvalido("Peso de rateio não pode ser negativo.")
    soma = sum(pesos)
    if soma == 0:
        raise ValorInvalido("A soma dos pesos do rateio é zero.")

    centavos = int((total * 100).to_integral_value())
    sinal = -1 if centavos < 0 else 1
    centavos = abs(centavos)

    cotas = [Decimal(centavos) * p / soma for p in pesos]
    inteiros = [int(c) for c in cotas]  # piso, porque as cotas são não negativas
    faltam = centavos - sum(inteiros)
    # Maior fração primeiro; empate decidido pela ordem original, para o
    # resultado ser o mesmo toda vez que a mesma entrada vier.
    ordem = sorted(range(len(pesos)), key=lambda i: (-(cotas[i] - inteiros[i]), i))
    for i in ordem[:faltam]:
        inteiros[i] += 1

    return [(Decimal(sinal * c) / 100).quantize(CENTAVO) for c in inteiros]


def somar(valores) -> Decimal:
    return arredondar(sum((Decimal(str(v)) for v in valores), ZERO))
