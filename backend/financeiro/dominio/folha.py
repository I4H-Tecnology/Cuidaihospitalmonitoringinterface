"""Folha de pagamento: INSS, IRRF, FGTS, DSR, holerite e as contas que ela gera.

Decisão de produto (26/09/2026): o módulo CALCULA a folha e ACEITA AJUSTE. Na
maioria das empresas quem fecha a folha oficial é a contabilidade; o cálculo
aqui serve para prever o custo, conferir o que ela mandou e gerar as contas a
pagar. Se o número da contabilidade for outro, ele prevalece (ver
`servicos/pessoal.py`, ajuste da contabilidade) e a diferença fica registrada.

O que este arquivo cobre: salário mensal (proporcional na admissão e no
desligamento), variáveis do mês, reflexo das horas extras no DSR, INSS do
empregado (progressivo) e do pró-labore (11%), IRRF com dependentes, pensão,
desconto simplificado e a redução da Lei 15.270/2025, FGTS, encargos patronais
e adiantamento quinzenal.

O que NÃO cobre, de propósito, nesta versão: férias, 13º e rescisão (médias,
avos, aviso prévio, multa do FGTS). Ficam para uma fase própria.

Tabela de imposto é DADO, não código: vem de `tabela_fiscal`, versionada por
vigência e com a norma que a publicou. Quando o governo mudar a tabela, muda-se
uma linha no banco, não este arquivo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from .calendario import Calendario, competencia, somar_meses, ultimo_dia_do_mes
from .dinheiro import CEM, ZERO, arredondar, dinheiro, percentual_de, somar

VINCULOS_EM_FOLHA = ("clt", "aprendiz", "estagio", "prolabore")
VINCULOS_CLT = ("clt", "aprendiz")


# ==========================================================================
# Tabelas
# ==========================================================================

@dataclass(frozen=True)
class TabelaInss:
    """Faixas do INSS do empregado: (limite superior da faixa, alíquota em %)."""

    faixas: tuple[tuple[Decimal, Decimal], ...]
    # Pró-labore é contribuinte individual: 11% sobre a remuneração, até o teto,
    # sem progressão (Lei 8.212/91, art. 21 e art. 30, §4º).
    aliquota_contribuinte_individual: Decimal = Decimal("11")
    fonte: str = ""

    @property
    def teto(self) -> Decimal:
        return self.faixas[-1][0]

    @classmethod
    def de_dados(cls, dados: dict, fonte: str = "") -> "TabelaInss":
        faixas = tuple(
            (dinheiro(f["ate"]), Decimal(str(f["aliquota"]))) for f in dados.get("faixas", [])
        )
        if not faixas:
            raise ValueError("Tabela de INSS sem faixas.")
        limites = [f[0] for f in faixas]
        if limites != sorted(limites):
            raise ValueError("Faixas do INSS fora de ordem.")
        return cls(
            faixas=faixas,
            aliquota_contribuinte_individual=Decimal(
                str(dados.get("aliquota_contribuinte_individual", "11"))
            ),
            fonte=fonte,
        )


@dataclass(frozen=True)
class FaixaIrrf:
    ate: Decimal | None  # None na última faixa: sem limite
    aliquota: Decimal
    deducao: Decimal  # "parcela a deduzir" da tabela


@dataclass(frozen=True)
class ReducaoIrrf:
    """Redução do imposto por faixa de rendimento (Lei 15.270/2025).

    'fixa': reduz até `valor` (e nunca abaixo de zero).
    'linear': reduz `a − b × rendimentos`.
    """

    ate: Decimal
    tipo: str
    valor: Decimal = ZERO
    a: Decimal = ZERO
    b: Decimal = ZERO


@dataclass(frozen=True)
class TabelaIrrf:
    faixas: tuple[FaixaIrrf, ...]
    deducao_dependente: Decimal
    desconto_simplificado: Decimal
    reducoes: tuple[ReducaoIrrf, ...] = ()
    # Retenção de valor igual ou inferior a R$ 10,00 é dispensada
    # (Lei 9.430/96, art. 67): o imposto fica para o ajuste anual.
    dispensa_retencao_ate: Decimal = ZERO
    fonte: str = ""

    @classmethod
    def de_dados(cls, dados: dict, fonte: str = "") -> "TabelaIrrf":
        faixas = tuple(
            FaixaIrrf(
                ate=dinheiro(f["ate"]) if f.get("ate") not in (None, "") else None,
                aliquota=Decimal(str(f["aliquota"])),
                deducao=dinheiro(f.get("deducao", "0")),
            )
            for f in dados.get("faixas", [])
        )
        if not faixas or faixas[-1].ate is not None:
            raise ValueError("A última faixa do IRRF deve ser sem limite (ate = null).")
        reducoes = tuple(
            sorted(
                (
                    ReducaoIrrf(
                        ate=dinheiro(r["ate"]),
                        tipo=r["tipo"],
                        valor=dinheiro(r.get("valor", "0")),
                        a=Decimal(str(r.get("a", "0"))),
                        b=Decimal(str(r.get("b", "0"))),
                    )
                    for r in dados.get("reducoes", [])
                ),
                key=lambda r: r.ate,
            )
        )
        for r in reducoes:
            if r.tipo not in ("fixa", "linear"):
                raise ValueError(f"Tipo de redução do IRRF desconhecido: {r.tipo!r}.")
        return cls(
            faixas=faixas,
            deducao_dependente=dinheiro(dados.get("deducao_dependente", "0")),
            desconto_simplificado=dinheiro(dados.get("desconto_simplificado", "0")),
            reducoes=reducoes,
            dispensa_retencao_ate=dinheiro(dados.get("dispensa_retencao_ate", "0")),
            fonte=fonte,
        )


# ==========================================================================
# INSS e IRRF
# ==========================================================================

def inss_empregado(base: Decimal, tabela: TabelaInss) -> Decimal:
    """INSS progressivo: cada alíquota só sobre a parte do salário na sua faixa.

    Soma sem arredondar e arredonda o total. Arredondando faixa a faixa, o teto
    de 2026 daria R$ 988,10 — um centavo acima do máximo oficial.
    """
    base = min(max(Decimal(base), ZERO), tabela.teto)
    total, piso = Decimal(0), Decimal(0)
    for limite, aliquota in tabela.faixas:
        if base <= piso:
            break
        total += (min(base, limite) - piso) * aliquota / CEM
        piso = limite
    return arredondar(total)


def inss_contribuinte_individual(base: Decimal, tabela: TabelaInss) -> Decimal:
    base = min(max(Decimal(base), ZERO), tabela.teto)
    return arredondar(base * tabela.aliquota_contribuinte_individual / CEM)


@dataclass(frozen=True)
class CalculoIrrf:
    """O IRRF com todos os passos à mostra — o holerite e a conferência usam cada um."""

    rendimentos: Decimal
    deducoes_legais: Decimal
    simplificado: bool
    base: Decimal
    aliquota: Decimal
    imposto_pela_tabela: Decimal
    reducao: Decimal
    dispensado: bool
    imposto: Decimal


def _imposto_da_base(base: Decimal, tabela: TabelaIrrf) -> tuple[Decimal, Decimal]:
    for faixa in tabela.faixas:
        if faixa.ate is None or base <= faixa.ate:
            imposto = max(ZERO, base * faixa.aliquota / CEM - faixa.deducao)
            return arredondar(imposto), faixa.aliquota
    raise AssertionError("tabela validada em de_dados sempre termina sem limite")


def reducao_do_imposto(rendimentos: Decimal, tabela: TabelaIrrf) -> Decimal:
    """Quanto a Lei 15.270/2025 abate, pelo RENDIMENTO TRIBUTÁVEL (bruto).

    A faixa da redução é decidida pelo rendimento, não pela base de cálculo:
    quem ganha R$ 5.000,00 tem o imposto zerado mesmo que, depois do INSS, a
    base caia em outra faixa da tabela progressiva.
    """
    for r in tabela.reducoes:
        if rendimentos <= r.ate:
            if r.tipo == "fixa":
                return r.valor
            return max(ZERO, arredondar(r.a - r.b * rendimentos))
    return ZERO


def irrf_mensal(
    rendimentos: Decimal,
    inss: Decimal,
    dependentes: int,
    pensao: Decimal,
    tabela: TabelaIrrf,
) -> CalculoIrrf:
    """IRRF do mês, escolhendo o que for melhor para o trabalhador.

    Deduções legais (INSS, dependentes e pensão alimentícia) ou o desconto
    simplificado mensal — vale o que der MENOS imposto, que é como a Receita
    manda a fonte pagadora calcular. Depois, a redução pelo rendimento, que
    nunca deixa o imposto negativo.
    """
    rendimentos = max(Decimal(rendimentos), ZERO)
    legais = arredondar(inss + tabela.deducao_dependente * dependentes + pensao)

    base_legal = max(ZERO, rendimentos - legais)
    base_simples = max(ZERO, rendimentos - tabela.desconto_simplificado)
    imposto_legal, aliquota_legal = _imposto_da_base(base_legal, tabela)
    imposto_simples, aliquota_simples = _imposto_da_base(base_simples, tabela)

    simplificado = imposto_simples < imposto_legal
    if simplificado:
        base, aliquota, pela_tabela = base_simples, aliquota_simples, imposto_simples
    else:
        base, aliquota, pela_tabela = base_legal, aliquota_legal, imposto_legal

    reducao = min(reducao_do_imposto(rendimentos, tabela), pela_tabela)
    imposto = pela_tabela - reducao
    dispensado = ZERO < imposto <= tabela.dispensa_retencao_ate
    if dispensado:
        imposto = ZERO

    return CalculoIrrf(
        rendimentos=arredondar(rendimentos),
        deducoes_legais=legais,
        simplificado=simplificado,
        base=arredondar(base),
        aliquota=aliquota,
        imposto_pela_tabela=pela_tabela,
        reducao=reducao,
        dispensado=dispensado,
        imposto=imposto,
    )


# ==========================================================================
# Holerite
# ==========================================================================

@dataclass(frozen=True)
class Rubrica:
    """Evento da folha e em que ele incide.

    Em DESCONTO, "incide" quer dizer que REDUZ a base: falta reduz a base do
    INSS, do IRRF e do FGTS; vale-transporte não reduz nenhuma.
    """

    chave: str
    nome: str
    tipo: str  # provento | desconto | informativo
    incide_inss: bool = False
    incide_irrf: bool = False
    incide_fgts: bool = False
    deduz_irrf: bool = False  # pensão alimentícia judicial
    entra_dsr: bool = False  # variável com reflexo no descanso semanal remunerado


@dataclass(frozen=True)
class Lancamento:
    """Item que entra no cálculo: fixo do colaborador ou variável do mês."""

    rubrica: Rubrica
    valor: Decimal
    referencia: Decimal | None = None
    origem: str = "lancado"  # fixo | lancado | adiantamento


@dataclass(frozen=True)
class Colaborador:
    vinculo: str
    salario_base: Decimal
    dependentes: int = 0
    data_admissao: date | None = None
    data_desligamento: date | None = None


@dataclass(frozen=True)
class Encargos:
    """Encargos da empresa, em %. Dependem do regime tributário.

    No Simples Nacional (anexos I, II, III e V) a contribuição patronal já está
    no DAS: INSS patronal, RAT e terceiros ficam em zero. No Lucro Presumido e
    no Real, 20% de INSS patronal (Lei 8.212/91, art. 22) mais RAT e terceiros,
    que variam por atividade — por isso é configuração, não constante.
    """

    inss_patronal: Decimal = ZERO
    rat: Decimal = ZERO
    terceiros: Decimal = ZERO
    fgts: Decimal = Decimal("8")
    fgts_aprendiz: Decimal = Decimal("2")


@dataclass
class ItemCalculado:
    chave: str
    nome: str
    tipo: str
    valor: Decimal
    referencia: Decimal | None = None
    origem: str = "calculado"


@dataclass
class Holerite:
    itens: list[ItemCalculado]
    dias_trabalhados: int
    total_proventos: Decimal
    total_descontos: Decimal
    liquido: Decimal
    base_inss: Decimal
    inss: Decimal
    base_irrf: Decimal
    irrf: Decimal
    detalhe_irrf: CalculoIrrf | None
    base_fgts: Decimal
    fgts: Decimal
    encargos_patronais: Decimal
    beneficios: Decimal
    custo_total: Decimal
    avisos: list[str] = field(default_factory=list)


def rubricas_do_sistema() -> dict[str, Rubrica]:
    """As rubricas que o próprio cálculo cria. Incidências definidas em lei.

    `servicos/organizacao.py` grava estas mesmas definições no banco quando
    provisiona uma empresa; o cálculo recebe de volta as linhas do banco.
    """
    return {
        "salario": Rubrica("salario", "Salário", "provento", True, True, True),
        "prolabore": Rubrica("prolabore", "Pró-labore", "provento", True, True, False),
        # Bolsa de estágio não tem INSS nem FGTS (Lei 11.788/2008), mas é
        # rendimento tributável no IR.
        "bolsa_estagio": Rubrica("bolsa_estagio", "Bolsa-estágio", "provento", False, True, False),
        "dsr": Rubrica("dsr", "DSR sobre variáveis", "provento", True, True, True),
        "inss": Rubrica("inss", "INSS", "desconto"),
        "irrf": Rubrica("irrf", "IRRF", "desconto"),
        "adiantamento": Rubrica("adiantamento", "Adiantamento salarial", "provento"),
        "desconto_adiantamento": Rubrica("desconto_adiantamento", "Adiantamento salarial (desconto)", "desconto"),
    }


def dias_trabalhados(colab: Colaborador, mes: date) -> int:
    """Dias do mês comercial (30) dentro do vínculo.

    Folha usa mês de 30 dias, com 28, 29 ou 31 no calendário. Admitido no dia
    16 trabalha 15 dias; desligado no último dia do mês, 30.
    """
    inicio, fim = competencia(mes), ultimo_dia_do_mes(mes)
    admissao = colab.data_admissao or inicio
    if admissao > fim:
        return 0
    if colab.data_desligamento and colab.data_desligamento < inicio:
        return 0
    primeiro = admissao.day if admissao >= inicio else 1
    primeiro = min(primeiro, 30)
    ultimo = 30
    if colab.data_desligamento and colab.data_desligamento <= fim and colab.data_desligamento != fim:
        ultimo = min(colab.data_desligamento.day, 30)
    return max(0, ultimo - primeiro + 1)


def valor_por_calculo(
    calculo: str,
    salario_base: Decimal,
    horas_mes: Decimal,
    referencia: Decimal | None,
    valor_informado: Decimal | None,
    percentual_rubrica: Decimal | None,
    limite: Decimal | None = None,
) -> Decimal:
    """Valor de um item a partir da regra da rubrica.

    valor               o valor informado
    percentual_salario  referência (ou o % da rubrica) sobre o salário base
    horas               horas × salário/horas do mês × % da rubrica. O % é o
                        multiplicador inteiro: hora extra 50% usa 150, hora
                        extra 100% usa 200, adicional noturno usa 20 (só o
                        adicional, a hora já foi paga no salário).
    dias                dias × salário/30 (faltas)

    `limite` corta o resultado: é o que faz o vale-transporte descontar 6% do
    salário, mas nunca mais do que o custo do próprio vale.
    """
    ref = Decimal(referencia) if referencia is not None else None
    pct = Decimal(percentual_rubrica) if percentual_rubrica is not None else None
    if calculo == "valor":
        valor = Decimal(valor_informado or 0)
    elif calculo == "percentual_salario":
        valor = salario_base * (ref if ref is not None else (pct or ZERO)) / CEM
    elif calculo == "horas":
        if not horas_mes:
            raise ValueError("Horas do mês não informadas para o cálculo por hora.")
        multiplicador = pct if pct is not None else CEM
        valor = (ref or ZERO) * salario_base / horas_mes * multiplicador / CEM
    elif calculo == "dias":
        valor = (ref or ZERO) * salario_base / 30
    else:
        raise ValueError(f"Regra de cálculo desconhecida: {calculo!r}.")
    valor = arredondar(valor)
    if limite is not None:
        valor = min(valor, arredondar(limite))
    return valor


def _item(rubrica: Rubrica, valor: Decimal, referencia=None, origem="calculado") -> ItemCalculado:
    return ItemCalculado(
        chave=rubrica.chave,
        nome=rubrica.nome,
        tipo=rubrica.tipo,
        valor=arredondar(valor),
        referencia=referencia,
        origem=origem,
    )


def calcular_holerite(
    colab: Colaborador,
    mes: date,
    lancamentos: list[Lancamento],
    tabela_inss: TabelaInss,
    tabela_irrf: TabelaIrrf,
    encargos: Encargos,
    calendario: Calendario,
    sistema: dict[str, Rubrica] | None = None,
) -> Holerite:
    """Holerite de um colaborador numa competência."""
    if colab.vinculo not in VINCULOS_EM_FOLHA:
        raise ValueError(f"Vínculo {colab.vinculo!r} não entra em folha; pague como conta a pagar.")
    sistema = sistema or rubricas_do_sistema()
    mes = competencia(mes)
    avisos: list[str] = []
    itens: list[ItemCalculado] = []
    por_chave = {}  # chave -> rubrica, para as bases

    dias = dias_trabalhados(colab, mes)
    principal = {
        "clt": "salario",
        "aprendiz": "salario",
        "estagio": "bolsa_estagio",
        "prolabore": "prolabore",
    }[colab.vinculo]
    if dias == 0:
        avisos.append("Colaborador fora do vínculo nesta competência.")
    else:
        valor = colab.salario_base if dias == 30 else arredondar(colab.salario_base * dias / 30)
        if valor > 0:
            rub = sistema[principal]
            itens.append(_item(rub, valor, Decimal(dias)))
            por_chave[rub.chave] = rub

    for lanc in lancamentos:
        if lanc.valor == 0:
            continue
        itens.append(_item(lanc.rubrica, lanc.valor, lanc.referencia, lanc.origem))
        por_chave[lanc.rubrica.chave] = lanc.rubrica

    # Reflexo das variáveis no DSR (Lei 605/49): hora extra habitual paga
    # também o descanso. Valor = variáveis ÷ dias úteis × domingos e feriados.
    if colab.vinculo in VINCULOS_CLT:
        variaveis = somar(
            i.valor for i in itens if i.tipo == "provento" and por_chave[i.chave].entra_dsr
        )
        if variaveis > 0:
            uteis, descansos = calendario.dias_uteis_e_descansos(mes)
            if uteis:
                rub = sistema["dsr"]
                itens.append(_item(rub, variaveis / uteis * descansos))
                por_chave[rub.chave] = rub

    def base(atributo: str) -> Decimal:
        proventos = somar(i.valor for i in itens if i.tipo == "provento" and getattr(por_chave[i.chave], atributo))
        descontos = somar(i.valor for i in itens if i.tipo == "desconto" and getattr(por_chave[i.chave], atributo))
        return max(ZERO, proventos - descontos)

    base_inss = base("incide_inss")
    if colab.vinculo in VINCULOS_CLT:
        inss = inss_empregado(base_inss, tabela_inss)
    elif colab.vinculo == "prolabore":
        inss = inss_contribuinte_individual(base_inss, tabela_inss)
    else:
        inss = ZERO
    if inss > 0:
        itens.append(_item(sistema["inss"], inss))
        por_chave[sistema["inss"].chave] = sistema["inss"]

    rendimentos = base("incide_irrf")
    pensao = somar(i.valor for i in itens if i.tipo == "desconto" and por_chave[i.chave].deduz_irrf)
    detalhe = None
    irrf = ZERO
    if rendimentos > 0:
        detalhe = irrf_mensal(rendimentos, inss, colab.dependentes, pensao, tabela_irrf)
        irrf = detalhe.imposto
        if irrf > 0:
            itens.append(_item(sistema["irrf"], irrf, detalhe.aliquota))
            por_chave[sistema["irrf"].chave] = sistema["irrf"]
        if detalhe.dispensado:
            avisos.append("IRRF de até R$ 10,00 não retido (Lei 9.430/96, art. 67).")

    base_fgts = base("incide_fgts")
    aliquota_fgts = {"clt": encargos.fgts, "aprendiz": encargos.fgts_aprendiz}.get(colab.vinculo, ZERO)
    fgts = percentual_de(base_fgts, aliquota_fgts)

    # A contribuição patronal não tem teto: incide sobre a remuneração inteira.
    if colab.vinculo in VINCULOS_CLT:
        aliquota_patronal = encargos.inss_patronal + encargos.rat + encargos.terceiros
    elif colab.vinculo == "prolabore":
        aliquota_patronal = encargos.inss_patronal
    else:
        aliquota_patronal = ZERO
    encargos_patronais = percentual_de(base_inss, aliquota_patronal)

    proventos = somar(i.valor for i in itens if i.tipo == "provento")
    descontos = somar(i.valor for i in itens if i.tipo == "desconto")
    beneficios = somar(i.valor for i in itens if i.tipo == "informativo")
    liquido = proventos - descontos
    if liquido < 0:
        avisos.append("Descontos maiores que os proventos: o líquido ficou negativo.")

    return Holerite(
        itens=itens,
        dias_trabalhados=dias,
        total_proventos=proventos,
        total_descontos=descontos,
        liquido=liquido,
        base_inss=base_inss,
        inss=inss,
        base_irrf=rendimentos,
        irrf=irrf,
        detalhe_irrf=detalhe,
        base_fgts=base_fgts,
        fgts=fgts,
        encargos_patronais=encargos_patronais,
        beneficios=beneficios,
        custo_total=proventos + fgts + encargos_patronais + beneficios,
        avisos=avisos,
    )


def calcular_adiantamento(
    colab: Colaborador, mes: date, percentual: Decimal, sistema: dict[str, Rubrica] | None = None
) -> Holerite:
    """Adiantamento quinzenal ("vale"): um percentual do salário, sem imposto.

    O imposto incide no fechamento do mês, quando o adiantamento volta como
    desconto. O custo também só conta lá — contar aqui e lá dobraria a folha.
    """
    sistema = sistema or rubricas_do_sistema()
    dias = dias_trabalhados(colab, mes)
    proporcional = colab.salario_base if dias == 30 else colab.salario_base * dias / 30
    valor = percentual_de(proporcional, percentual) if dias else ZERO
    itens = [_item(sistema["adiantamento"], valor, Decimal(percentual))] if valor > 0 else []
    return Holerite(
        itens=itens,
        dias_trabalhados=dias,
        total_proventos=valor,
        total_descontos=ZERO,
        liquido=valor,
        base_inss=ZERO,
        inss=ZERO,
        base_irrf=ZERO,
        irrf=ZERO,
        detalhe_irrf=None,
        base_fgts=ZERO,
        fgts=ZERO,
        encargos_patronais=ZERO,
        beneficios=ZERO,
        custo_total=ZERO,
        avisos=[] if valor else ["Sem dias de vínculo nesta competência: sem adiantamento."],
    )


# ==========================================================================
# Provisões e o que a folha gera em contas a pagar
# ==========================================================================

@dataclass(frozen=True)
class Provisao:
    """Quanto separar por mês para férias e 13º de um colaborador."""

    ferias: Decimal  # 1/12 do salário mais o terço constitucional
    decimo_terceiro: Decimal  # 1/12 do salário
    encargos: Decimal  # FGTS e contribuição patronal sobre os dois

    @property
    def total(self) -> Decimal:
        return self.ferias + self.decimo_terceiro + self.encargos


def provisao_mensal(colab: Colaborador, encargos: Encargos) -> Provisao:
    if colab.vinculo not in VINCULOS_CLT:
        return Provisao(ZERO, ZERO, ZERO)
    salario = Decimal(colab.salario_base)
    ferias = arredondar(salario / 12 * Decimal(4) / 3)
    decimo = arredondar(salario / 12)
    aliquota_fgts = encargos.fgts if colab.vinculo == "clt" else encargos.fgts_aprendiz
    aliquota = aliquota_fgts + encargos.inss_patronal + encargos.rat + encargos.terceiros
    return Provisao(ferias, decimo, percentual_de(ferias + decimo, aliquota))


@dataclass
class ParteDoTitulo:
    """Um pedaço de título a pagar: vai para a categoria `categoria` (chave de
    sistema) e para o centro de custo do colaborador que o originou."""

    categoria: str
    centro_custo: str | None
    valor: Decimal


@dataclass
class TituloDaFolha:
    chave: str  # idempotência: fechar a mesma folha duas vezes não duplica conta
    descricao: str
    credor: str  # 'colaborador:<ref>', 'receita_federal', 'fgts' ou 'pessoa:<ref>'
    vencimento: date
    partes: list[ParteDoTitulo]

    @property
    def valor(self) -> Decimal:
        return somar(p.valor for p in self.partes)


@dataclass(frozen=True)
class HoleriteParaFechar:
    """O que o fechamento precisa saber de cada holerite (já com ajuste, se houver)."""

    colaborador_ref: str
    colaborador_nome: str
    centro_custo: str | None
    vinculo: str
    liquido: Decimal
    inss: Decimal
    irrf: Decimal
    fgts: Decimal
    encargos_patronais: Decimal
    repasses: tuple[tuple[str, str, Decimal], ...] = ()  # (pessoa_ref, descrição, valor)


def vencimentos_padrao(mes: date, calendario: Calendario) -> dict[str, date]:
    """Prazos legais da folha da competência `mes`.

    salário       5º dia útil trabalhista do mês seguinte (CLT art. 459, §1º)
    INSS e IRRF   dia 20 do mês seguinte, antecipado se não houver banco (DCTFWeb)
    FGTS          dia 20 do mês seguinte, antecipado (FGTS Digital, Lei 14.438/2022)
    """
    seguinte = somar_meses(competencia(mes), 1)
    dia_20 = calendario.antecipar_para_dia_util(seguinte.replace(day=20))
    return {
        "salario": calendario.enesimo_dia_util_trabalhista(seguinte.year, seguinte.month, 5),
        "dctfweb": dia_20,
        "fgts": dia_20,
    }


def titulos_da_folha(
    tipo_folha: str,
    mes: date,
    holerites: list[HoleriteParaFechar],
    data_pagamento: date,
    vencimentos: dict[str, date],
    guia_unica: bool = True,
) -> list[TituloDaFolha]:
    """As contas a pagar que o fechamento cria.

    Uma por colaborador (o líquido), uma por credor de repasse (pensão,
    consignado) e as guias. Cada guia é repartida pelos centros de custo de
    quem a originou, para o custo de pessoal por centro fechar com o que foi
    pago ao governo.

    Categoria: o que é parte do salário bruto (líquido, INSS e IRRF do
    empregado, repasses) vai para 'folha.salarios'; o que é custo da empresa
    por cima do bruto vai para 'folha.encargos' e 'folha.fgts'. Assim a DRE
    mostra bruto mais encargos, e não só o que caiu na conta do funcionário.
    """
    ref = competencia(mes)
    rotulo_mes = f"{ref.month:02d}/{ref.year}"
    titulos: list[TituloDaFolha] = []

    for h in holerites:
        if h.liquido > 0:
            titulos.append(
                TituloDaFolha(
                    chave=f"liquido:{h.colaborador_ref}",
                    descricao=f"{_rotulo_do_pagamento(tipo_folha, h.vinculo)} {rotulo_mes} — {h.colaborador_nome}",
                    credor=f"colaborador:{h.colaborador_ref}",
                    vencimento=data_pagamento,
                    partes=[ParteDoTitulo(_categoria_do_bruto(h.vinculo), h.centro_custo, h.liquido)],
                )
            )

    # Repasses de desconto a terceiros (pensão, consignado), agrupados por credor.
    repasses: dict[str, TituloDaFolha] = {}
    for h in holerites:
        cat = _categoria_do_bruto(h.vinculo)
        for pessoa_ref, descricao, valor in h.repasses:
            if valor <= 0:
                continue
            titulo = repasses.setdefault(
                pessoa_ref,
                TituloDaFolha(
                    chave=f"repasse:{pessoa_ref}",
                    descricao=f"Repasse {descricao} {rotulo_mes}",
                    credor=f"pessoa:{pessoa_ref}",
                    vencimento=data_pagamento,
                    partes=[],
                ),
            )
            titulo.partes.append(ParteDoTitulo(cat, h.centro_custo, valor))
    titulos.extend(repasses.values())

    if tipo_folha == "adiantamento":
        return titulos

    def partes_da_guia(campos: list[tuple[str, str]]) -> list[ParteDoTitulo]:
        # Agrupa por (categoria, centro) para o título não ter uma linha por pessoa.
        acumulado: dict[tuple[str, str | None], Decimal] = {}
        for h in holerites:
            for atributo, categoria in campos:
                # INSS e IRRF retidos do sócio são parte do pró-labore, não do
                # salário dos empregados: a DRE mostra os dois separados.
                if atributo in ("inss", "irrf") and h.vinculo == "prolabore":
                    categoria = "folha.prolabore"
                valor = getattr(h, atributo)
                if valor > 0:
                    chave = (categoria, h.centro_custo)
                    acumulado[chave] = acumulado.get(chave, ZERO) + valor
        return [ParteDoTitulo(c, cc, v) for (c, cc), v in acumulado.items()]

    if guia_unica:
        partes = partes_da_guia(
            [("inss", "folha.salarios"), ("irrf", "folha.salarios"), ("encargos_patronais", "folha.encargos")]
        )
        if partes:
            titulos.append(
                TituloDaFolha("dctfweb", f"DCTFWeb (INSS e IRRF) {rotulo_mes}", "receita_federal", vencimentos["dctfweb"], partes)
            )
    else:
        inss = partes_da_guia([("inss", "folha.salarios"), ("encargos_patronais", "folha.encargos")])
        if inss:
            titulos.append(TituloDaFolha("inss", f"INSS {rotulo_mes}", "receita_federal", vencimentos["dctfweb"], inss))
        irrf = partes_da_guia([("irrf", "folha.salarios")])
        if irrf:
            titulos.append(TituloDaFolha("irrf", f"IRRF sobre salários {rotulo_mes}", "receita_federal", vencimentos["dctfweb"], irrf))

    fgts = partes_da_guia([("fgts", "folha.fgts")])
    if fgts:
        titulos.append(TituloDaFolha("fgts", f"FGTS {rotulo_mes}", "fgts", vencimentos["fgts"], fgts))
    return titulos


def _categoria_do_bruto(vinculo: str) -> str:
    return "folha.prolabore" if vinculo == "prolabore" else "folha.salarios"


def _rotulo_do_pagamento(tipo_folha: str, vinculo: str) -> str:
    if tipo_folha == "adiantamento":
        return "Adiantamento"
    return {"prolabore": "Pró-labore", "estagio": "Bolsa-estágio"}.get(vinculo, "Salário")
