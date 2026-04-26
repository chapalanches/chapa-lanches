let pedidos = [];
let ultimaQuantidadePedidos = 0;

const STORAGE_KEYS = ["pedidos", "chapa_pedidos", "pedidos_chapa"];
const LOGIN_STORAGE_KEY = "chapa_admin_logado";
const TABELA_PEDIDOS = "orders";
const TABELA_CONFIG_LOJA = "store_settings";
const STORE_SETTINGS_ID = 1;
const COLUNAS_STORAGE_KEY = "chapa_admin_colunas_recolhidas";

let supabaseClient = null;
let realtimeChannel = null;
let carregandoPedidos = false;
let ultimoHashPedidos = "";
let dataAtualPainel = obterChaveDiaAtual();
let configuracaoLoja = null;

if (
  window.supabase &&
  window.APP_CONFIG &&
  window.APP_CONFIG.supabaseUrl &&
  window.APP_CONFIG.supabaseAnonKey
) {
  supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.supabaseUrl,
    window.APP_CONFIG.supabaseAnonKey
  );
}

function byId(id) {
  return document.getElementById(id);
}

function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function obterChavePedidosUsada() {
  for (const chave of STORAGE_KEYS) {
    const valor = localStorage.getItem(chave);
    if (valor) {
      try {
        const convertido = JSON.parse(valor);
        if (Array.isArray(convertido)) {
          return chave;
        }
      } catch (e) {}
    }
  }
  return "pedidos";
}

function obterPedidosStorage() {
  for (const chave of STORAGE_KEYS) {
    const dados = localStorage.getItem(chave);
    if (dados) {
      try {
        const lista = JSON.parse(dados);
        if (Array.isArray(lista)) {
          return { chave, pedidos: lista };
        }
      } catch (erro) {
        console.error("Erro ao ler localStorage:", chave, erro);
      }
    }
  }
  return { chave: "pedidos", pedidos: [] };
}

function salvarPedidosStorage() {
  const chave = obterChavePedidosUsada();
  localStorage.setItem(chave, JSON.stringify(pedidos));
}

function gerarId(index) {
  return "PED" + String(index + 1).padStart(4, "0");
}

function gerarUidPedido(pedido, index, dataObj) {
  const baseId = pedido.id || gerarId(index);
  return `${baseId}_${dataObj.getTime()}_${index}`;
}

function obterChaveDiaAtual() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function verificarViradaDeDia() {
  const chaveHoje = obterChaveDiaAtual();

  if (chaveHoje !== dataAtualPainel) {
    console.log("Virada de dia detectada. Limpando painel e carregando novo dia.");
    dataAtualPainel = chaveHoje;
    pedidos = [];
    ultimaQuantidadePedidos = 0;
    ultimoHashPedidos = "";
    atualizarResumo();
    renderizarQuadro();
    carregarPedidos(false);
  }
}

function converterDataSegura(valor) {
  if (!valor) return new Date();

  const dataDireta = new Date(valor);
  if (!isNaN(dataDireta.getTime())) return dataDireta;

  if (typeof valor === "string") {
    const partes = valor.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (partes) {
      const dia = Number(partes[1]);
      const mes = Number(partes[2]) - 1;
      const ano = Number(partes[3]);
      const hora = Number(partes[4] || 0);
      const minuto = Number(partes[5] || 0);
      const segundo = Number(partes[6] || 0);
      return new Date(ano, mes, dia, hora, minuto, segundo);
    }
  }

  return new Date();
}

function formatarDataBR(data) {
  return data.toLocaleString("pt-BR");
}

function formatarHora(data) {
  return data.toLocaleTimeString("pt-BR");
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarMoedaRawBT(valor) {
  const numero = Number(valor || 0);
  return "R$" + numero.toFixed(2).replace(".", ",");
}

function normalizarTipoEntrega(valor) {
  const texto = String(valor || "").toLowerCase().trim();
  if (texto.includes("retirada")) return "retirada";
  if (texto.includes("delivery")) return "delivery";
  if (texto.includes("entrega")) return "delivery";
  return texto || "não informado";
}

function normalizarStatus(valor) {
  const texto = String(valor || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

  if (texto === "novo") return "novo";
  if (texto === "pendente") return "novo";
  if (texto === "aceito") return "aceito";
  if (texto === "preparo") return "preparo";
  if (texto === "em_preparo") return "preparo";
  if (texto === "em preparo") return "preparo";
  if (texto === "saiu_entrega") return "saiu_entrega";
  if (texto === "em_entrega") return "saiu_entrega";
  if (texto === "em entrega") return "saiu_entrega";
  if (texto === "entrega") return "saiu_entrega";
  if (texto === "finalizado") return "finalizado";

  return "novo";
}

function statusLabel(status) {
  const s = normalizarStatus(status);
  if (s === "novo") return "Pendente";
  if (s === "aceito") return "Aceito";
  if (s === "preparo") return "Em preparo";
  if (s === "saiu_entrega") return "Em entrega";
  if (s === "finalizado") return "Finalizado";
  return "Pendente";
}

function extrairCampoDeNotas(notas, prefixo) {
  if (!notas) return "";
  const partes = String(notas).split(" | ");
  const encontrada = partes.find((parte) =>
    parte.toLowerCase().startsWith(prefixo.toLowerCase() + ":")
  );
  if (!encontrada) return "";
  return encontrada.split(":").slice(1).join(":").trim();
}

function removerCampoDeNotas(notas, prefixos) {
  if (!notas) return "";
  const listaPrefixos = prefixos.map((p) => p.toLowerCase());

  const partes = String(notas)
    .split(" | ")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((parte) => {
      const lower = parte.toLowerCase();
      return !listaPrefixos.some((prefixo) => lower.startsWith(prefixo + ":"));
    });

  return partes.join(" | ");
}

function normalizarPedido(pedido, index) {
  const itensOriginais = Array.isArray(pedido.itens)
    ? pedido.itens
    : Array.isArray(pedido.items)
    ? pedido.items
    : [];

  const dataObj = converterDataSegura(
    pedido.data || pedido.criadoEm || pedido.createdAt || pedido.created_at
  );

  const totalCalculadoItens = itensOriginais.reduce((acc, item) => {
    const quantidade = Number(item.quantidade || item.quantity || 1);
    const preco = Number(item.preco || item.valor || item.price || 0);
    return acc + quantidade * preco;
  }, 0);

  let subtotal = Number(pedido.subtotal || 0);
  if (!subtotal && totalCalculadoItens) subtotal = totalCalculadoItens;

  const taxaEntrega = Number(
    pedido.taxaEntrega || pedido.taxa || pedido.delivery_fee || 0
  );

  let total = Number(pedido.total || 0);
  if (!total) total = subtotal + taxaEntrega;

  const bancoIdNormalizado =
    pedido.bancoId ??
    pedido.id ??
    pedido.uuid ??
    pedido.order_id ??
    pedido.orderId ??
    null;

  const customerNotes = pedido.customer_notes || "";
  const pagamentoExtraido = extrairCampoDeNotas(customerNotes, "Pagamento");
  const complementoExtraido = extrairCampoDeNotas(customerNotes, "Complemento");
  const observacaoLimpa = removerCampoDeNotas(customerNotes, [
    "Pagamento",
    "Complemento",
    "Tempo estimado"
  ]);

  const itens = itensOriginais.map((item) => ({
    nome: item.nome || item.titulo || item.name || "Item",
    quantidade: Number(item.quantidade || item.quantity || 1),
    preco: Number(item.preco || item.valor || item.price || 0),
    observacao: item.observacao || item.observacoes || ""
  }));

  const tipoEntregaBruto =
    pedido.entrega ||
    pedido.tipoEntrega ||
    pedido.tipo ||
    pedido.order_type ||
    "Não informado";

  const enderecoCompleto = pedido.endereco || pedido.customer_address || "";

  const idExibicao =
    pedido.codigo ||
    pedido.code ||
    pedido.order_code ||
    `PED-${String(bancoIdNormalizado ?? index + 1).padStart(4, "0")}`;

  return {
    uid: gerarUidPedido({ id: bancoIdNormalizado || idExibicao }, index, dataObj),
    id: idExibicao,
    bancoId:
      bancoIdNormalizado !== null && bancoIdNormalizado !== undefined
        ? Number(bancoIdNormalizado)
        : null,
    cliente:
      pedido.cliente ||
      pedido.nome ||
      pedido.customer_name ||
      "Cliente não informado",
    telefone: pedido.telefone || pedido.whatsapp || pedido.customer_phone || "",
    entrega: tipoEntregaBruto,
    tipoEntrega: normalizarTipoEntrega(tipoEntregaBruto),
    endereco: enderecoCompleto,
    numero: pedido.numero || "",
    bairro: pedido.bairro || pedido.customer_neighborhood || "",
    cidade: pedido.cidade || pedido.customer_city || "",
    complemento: pedido.complemento || complementoExtraido || "",
    pagamento:
      pedido.pagamento ||
      pedido.formaPagamento ||
      pagamentoExtraido ||
      "Não informado",
    troco: pedido.troco || "",
    observacao:
      pedido.observacao || pedido.observacoes || observacaoLimpa || "",
    subtotal,
    taxaEntrega,
    total,
    distanciaKm: Number(pedido.delivery_distance_km || 0),
    status: normalizarStatus(pedido.status),
    dataOriginal:
      pedido.data ||
      pedido.criadoEm ||
      pedido.createdAt ||
      pedido.created_at ||
      formatarDataBR(dataObj),
    dataObj,
    dataTexto: formatarDataBR(dataObj),
    itens
  };
}

function gerarHashPedidos(lista) {
  try {
    return JSON.stringify(
      lista.map((p) => ({
        uid: p.uid,
        bancoId: p.bancoId,
        id: p.id,
        status: p.status,
        total: p.total,
        data: p.dataTexto
      }))
    );
  } catch (e) {
    return String(Date.now());
  }
}

function ehMesmoDia(data1, data2) {
  return (
    data1.getFullYear() === data2.getFullYear() &&
    data1.getMonth() === data2.getMonth() &&
    data1.getDate() === data2.getDate()
  );
}

function pedidoEhDeHoje(pedido) {
  if (!pedido || !pedido.dataObj) return false;
  return ehMesmoDia(pedido.dataObj, new Date());
}

async function buscarPedidosDoBanco() {
  if (!supabaseClient) return null;

  const { data, error } = await supabaseClient
    .from(TABELA_PEDIDOS)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar pedidos no Supabase:", error);
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function carregarPedidos(forcarSomNovoPedido = false) {
  if (carregandoPedidos) return;
  carregandoPedidos = true;

  try {
    verificarViradaDeDia();

    let pedidosBrutos = [];

    if (supabaseClient) {
      pedidosBrutos = await buscarPedidosDoBanco();
    } else {
      const dados = obterPedidosStorage();
      pedidosBrutos = Array.isArray(dados.pedidos) ? dados.pedidos : [];
    }

    const quantidadeAnterior = ultimaQuantidadePedidos;

    const pedidosNormalizados = pedidosBrutos
      .map((pedido, index) => normalizarPedido(pedido, index))
      .filter((pedido) => pedidoEhDeHoje(pedido));

    const novoHash = gerarHashPedidos(pedidosNormalizados);
    const houveMudanca = novoHash !== ultimoHashPedidos;

    if (
      (forcarSomNovoPedido || quantidadeAnterior > 0) &&
      pedidosNormalizados.length > quantidadeAnterior
    ) {
      tocarNotificacaoNovoPedido();
    }

    pedidos = pedidosNormalizados;
    ultimaQuantidadePedidos = pedidos.length;
    ultimoHashPedidos = novoHash;

    atualizarResumo();

    if (houveMudanca) {
      renderizarQuadro();
    } else {
      atualizarContadoresTempo();
    }
  } catch (erro) {
    console.error("Falha ao carregar pedidos:", erro);

    const dados = obterPedidosStorage();
    const pedidosBrutos = Array.isArray(dados.pedidos) ? dados.pedidos : [];

    pedidos = pedidosBrutos
      .map((pedido, index) => normalizarPedido(pedido, index))
      .filter((pedido) => pedidoEhDeHoje(pedido));

    ultimaQuantidadePedidos = pedidos.length;
    ultimoHashPedidos = gerarHashPedidos(pedidos);

    atualizarResumo();
    renderizarQuadro();
  } finally {
    carregandoPedidos = false;
  }
}

function atualizarResumo() {
  const pedidosHojeLista = pedidos.filter((p) => pedidoEhDeHoje(p));

  const faturamento = pedidosHojeLista.reduce(
    (acc, pedido) => acc + Number(pedido.subtotal || 0),
    0
  );

  const totalTaxasEntrega = pedidosHojeLista.reduce(
    (acc, pedido) => acc + Number(pedido.taxaEntrega || 0),
    0
  );

  const ticket = pedidosHojeLista.length
    ? faturamento / pedidosHojeLista.length
    : 0;

  const delivery = pedidosHojeLista.filter(
    (p) => p.tipoEntrega === "delivery"
  ).length;

  const retirada = pedidosHojeLista.filter(
    (p) => p.tipoEntrega === "retirada"
  ).length;

  const pendentes = pedidosHojeLista.filter((p) => p.status === "novo").length;

  const preparo = pedidosHojeLista.filter(
    (p) => p.status === "aceito" || p.status === "preparo"
  ).length;

  const entrega = pedidosHojeLista.filter(
    (p) => p.status === "saiu_entrega"
  ).length;

  const finalizados = pedidosHojeLista.filter(
    (p) => p.status === "finalizado"
  ).length;

  if (byId("totalPedidos")) byId("totalPedidos").textContent = pedidosHojeLista.length;
  if (byId("faturamentoDia")) byId("faturamentoDia").textContent = formatarMoeda(faturamento);
  if (byId("totalTaxasEntrega")) byId("totalTaxasEntrega").textContent = formatarMoeda(totalTaxasEntrega);
  if (byId("ticketMedio")) byId("ticketMedio").textContent = formatarMoeda(ticket);
  if (byId("totalDelivery")) byId("totalDelivery").textContent = delivery;
  if (byId("totalRetirada")) byId("totalRetirada").textContent = retirada;
  if (byId("countPendente")) byId("countPendente").textContent = pendentes;
  if (byId("countPreparo")) byId("countPreparo").textContent = preparo;
  if (byId("countEntrega")) byId("countEntrega").textContent = entrega;
  if (byId("countFinalizado")) byId("countFinalizado").textContent = finalizados;
}

function obterPedidosFiltrados() {
  const busca = (byId("buscaPedido")?.value || "").toLowerCase().trim();
  const filtroStatus = byId("filtroStatus")?.value || "";
  const filtroTipo = byId("filtroTipo")?.value || "";
  const ordenacao = byId("ordenacao")?.value || "mais-novo";

  const filtrados = pedidos.filter((pedido) => {
    const texto = `
      ${pedido.id}
      ${pedido.bancoId}
      ${pedido.cliente}
      ${pedido.telefone}
      ${pedido.entrega}
      ${pedido.tipoEntrega}
      ${pedido.endereco}
      ${pedido.numero}
      ${pedido.bairro}
      ${pedido.cidade}
      ${pedido.complemento}
      ${pedido.pagamento}
      ${pedido.observacao}
      ${pedido.status}
      ${statusLabel(pedido.status)}
    `
      .toLowerCase()
      .trim();

    const okBusca = !busca || texto.includes(busca);
    const okStatus = !filtroStatus || pedido.status === filtroStatus;
    const okTipo = !filtroTipo || pedido.tipoEntrega === filtroTipo;

    return okBusca && okStatus && okTipo;
  });

  if (ordenacao === "mais-novo") {
    filtrados.sort((a, b) => b.dataObj - a.dataObj);
  } else if (ordenacao === "mais-antigo") {
    filtrados.sort((a, b) => a.dataObj - b.dataObj);
  } else if (ordenacao === "maior-valor") {
    filtrados.sort((a, b) => b.total - a.total);
  } else if (ordenacao === "menor-valor") {
    filtrados.sort((a, b) => a.total - b.total);
  }

  return filtrados;
}

function tempoDecorridoTexto(dataObj) {
  const agora = new Date();
  const diffMs = agora - dataObj;
  const minutos = Math.floor(diffMs / 60000);

  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const restoMin = minutos % 60;

  if (horas < 24) {
    if (restoMin === 0) return `há ${horas}h`;
    return `há ${horas}h ${restoMin}min`;
  }

  const dias = Math.floor(horas / 24);
  return `há ${dias} dia(s)`;
}

function pedidoEhNovo(pedido) {
  const agora = new Date();
  const diffMin = (agora - pedido.dataObj) / 60000;
  return diffMin <= 5;
}

function pedidoAtrasado(pedido) {
  const agora = new Date();
  const diffMin = (agora - pedido.dataObj) / 60000;

  if (pedido.status === "novo" && diffMin >= 10) return true;
  if ((pedido.status === "aceito" || pedido.status === "preparo") && diffMin >= 25) return true;
  if (pedido.status === "saiu_entrega" && diffMin >= 40) return true;

  return false;
}

function criarItensHtml(pedido) {
  if (!pedido.itens.length) {
    return `<div class="item-row"><small>Nenhum item detalhado neste pedido.</small></div>`;
  }

  return pedido.itens
    .map(
      (item) => `
        <div class="item-row">
          <div class="item-row-top">
            <span>${escaparHtml(item.quantidade)}x ${escaparHtml(item.nome)}</span>
            <span>${formatarMoeda(item.preco * item.quantidade)}</span>
          </div>
          <small>Unitário: ${formatarMoeda(item.preco)}</small>
          ${item.observacao ? `<small>Obs.: ${escaparHtml(item.observacao)}</small>` : ""}
        </div>
      `
    )
    .join("");
}

function botaoProximoStatus(indice, statusAtual) {
  const status = normalizarStatus(statusAtual);

  if (status === "novo") {
    return `<button class="btn btn-yellow btn-small full-width" onclick="alterarStatus(${indice}, 'preparo')">Aceitar / Iniciar preparo</button>`;
  }
  if (status === "aceito") {
    return `<button class="btn btn-yellow btn-small full-width" onclick="alterarStatus(${indice}, 'preparo')">Iniciar preparo</button>`;
  }
  if (status === "preparo") {
    return `<button class="btn btn-blue btn-small full-width" onclick="alterarStatus(${indice}, 'saiu_entrega')">Saiu para entrega</button>`;
  }
  if (status === "saiu_entrega") {
    return `<button class="btn btn-green btn-small full-width" onclick="alterarStatus(${indice}, 'finalizado')">Finalizar pedido</button>`;
  }
  if (status === "finalizado") {
    return `<button class="btn btn-dark btn-small full-width" onclick="alterarStatus(${indice}, 'novo')">Reabrir pedido</button>`;
  }
  return `<button class="btn btn-yellow btn-small full-width" onclick="alterarStatus(${indice}, 'preparo')">Aceitar / Iniciar preparo</button>`;
}

function criarCardPedido(pedido) {
  const indiceReal = pedidos.findIndex((p) => p.uid === pedido.uid);
  const novo = pedidoEhNovo(pedido);
  const atrasado = pedidoAtrasado(pedido);

  let extraClasses = "";
  if (novo) extraClasses += " new-order";
  if (atrasado) extraClasses += " delay-order";

  return `
    <article class="order-card${extraClasses}" data-pedido-uid="${escaparHtml(pedido.uid)}">
      <div class="order-top">
        <div class="order-header-row">
          <div>
            <div class="order-id">${escaparHtml(pedido.id)}</div>
            <div class="order-customer">${escaparHtml(pedido.cliente)}</div>
          </div>
        </div>
        <div class="order-meta">
          <span class="badge badge-time js-tempo-decorrido" data-pedido-uid="${escaparHtml(
            pedido.uid
          )}">${escaparHtml(tempoDecorridoTexto(pedido.dataObj))}</span>
          <span class="badge badge-status">${escaparHtml(statusLabel(pedido.status))}</span>
          ${novo ? `<span class="badge badge-new">Novo pedido</span>` : ""}
          ${atrasado ? `<span class="badge badge-delay">Atenção</span>` : ""}
        </div>
      </div>

      <div class="order-body">
        <div class="mini-block">
          <h4>Informações</h4>
          <div class="line"><strong>Hora:</strong> ${escaparHtml(formatarHora(pedido.dataObj))}</div>
          <div class="line"><strong>Entrega:</strong> ${escaparHtml(
            pedido.tipoEntrega === "delivery" ? "Delivery" : "Retirada"
          )}</div>
          <div class="line"><strong>Pagamento:</strong> ${escaparHtml(pedido.pagamento)}</div>
          <div class="line"><strong>Telefone:</strong> ${escaparHtml(pedido.telefone || "Não informado")}</div>
          ${pedido.troco ? `<div class="line"><strong>Troco:</strong> ${escaparHtml(pedido.troco)}</div>` : ""}
        </div>

        <div class="mini-block">
          <h4>Endereço</h4>
          <div class="line"><strong>Rua:</strong> ${escaparHtml((pedido.endereco || "").split(",")[0] || "Não informado")}</div>
          <div class="line"><strong>Número:</strong> ${escaparHtml(
            pedido.numero ||
            ((pedido.endereco || "").split(",")[1] || "").trim() ||
            "-"
          )}</div>
          <div class="line"><strong>Bairro:</strong> ${escaparHtml(pedido.bairro || "-")}</div>
          <div class="line"><strong>Cidade:</strong> ${escaparHtml(pedido.cidade || "-")}</div>
          <div class="line"><strong>Comp.:</strong> ${escaparHtml(pedido.complemento || "-")}</div>
        </div>

        <div class="mini-block">
          <h4>Itens</h4>
          <div class="items-list">
            ${criarItensHtml(pedido)}
          </div>
        </div>

        <div class="mini-block">
          <h4>Resumo</h4>
          <div class="line"><strong>Subtotal:</strong> ${formatarMoeda(pedido.subtotal)}</div>
          <div class="line"><strong>Taxa:</strong> ${formatarMoeda(pedido.taxaEntrega)}</div>
          <div class="line"><strong>Total:</strong> ${formatarMoeda(pedido.total)}</div>
          <div class="line"><strong>Obs.:</strong> ${escaparHtml(pedido.observacao || "-")}</div>
        </div>
      </div>

      <div class="order-actions">
        ${botaoProximoStatus(indiceReal, pedido.status)}

        <select class="status-select" onchange="alterarStatus(${indiceReal}, this.value)">
          <option value="novo" ${pedido.status === "novo" ? "selected" : ""}>Pendente</option>
          <option value="aceito" ${pedido.status === "aceito" ? "selected" : ""}>Aceito</option>
          <option value="preparo" ${pedido.status === "preparo" ? "selected" : ""}>Em preparo</option>
          <option value="saiu_entrega" ${pedido.status === "saiu_entrega" ? "selected" : ""}>Em entrega</option>
          <option value="finalizado" ${pedido.status === "finalizado" ? "selected" : ""}>Finalizado</option>
        </select>

        <div class="action-grid">
          <button class="btn btn-yellow btn-small" onclick="imprimirPedidoRapido('${pedido.uid}')">Impressão rápida</button>
          <button class="btn btn-green btn-small" onclick="imprimirPedidoRawBT('${pedido.uid}')">Imprimir RawBT</button>
          <button class="btn btn-blue btn-small" onclick="copiarPedido('${pedido.uid}')">Copiar</button>
          <button class="btn btn-red btn-small" onclick="excluirPedido(${indiceReal})">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function renderizarColuna(elementId, lista) {
  const el = byId(elementId);
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div class="empty-column">Nenhum pedido nesta etapa.</div>`;
    return;
  }

  el.innerHTML = lista.map(criarCardPedido).join("");
}

function obterEstadoColunas() {
  try {
    const salvo = localStorage.getItem(COLUNAS_STORAGE_KEY);
    const estado = salvo ? JSON.parse(salvo) : {};
    return typeof estado === "object" && estado !== null ? estado : {};
  } catch (e) {
    return {};
  }
}

function salvarEstadoColunas(estado) {
  localStorage.setItem(COLUNAS_STORAGE_KEY, JSON.stringify(estado));
}

function capitalize(texto) {
  return String(texto || "").charAt(0).toUpperCase() + String(texto || "").slice(1);
}

function obterElementoColuna(nomeColuna) {
  if (nomeColuna === "pendente") return byId("colPendente");
  if (nomeColuna === "preparo") return byId("colPreparo");
  if (nomeColuna === "entrega") return byId("colEntrega");
  if (nomeColuna === "finalizado") return byId("colFinalizado");
  return null;
}

function aplicarEstadoColuna(nomeColuna, recolhida) {
  const coluna = document.querySelector(`.board-column[data-coluna="${nomeColuna}"]`);
  const corpo = obterElementoColuna(nomeColuna);
  const botao = byId(`btnToggle${capitalize(nomeColuna)}`);

  if (!coluna || !corpo || !botao) return;

  if (recolhida) {
    coluna.classList.add("collapsed");
    corpo.style.display = "none";
    botao.textContent = "+";
  } else {
    coluna.classList.remove("collapsed");
    corpo.style.display = "";
    botao.textContent = "−";
  }
}

function toggleColuna(nomeColuna) {
  const estado = obterEstadoColunas();
  estado[nomeColuna] = !estado[nomeColuna];
  salvarEstadoColunas(estado);
  aplicarEstadoColuna(nomeColuna, estado[nomeColuna]);
}

function aplicarEstadoColunasSalvas() {
  const estado = obterEstadoColunas();
  aplicarEstadoColuna("pendente", !!estado.pendente);
  aplicarEstadoColuna("preparo", !!estado.preparo);
  aplicarEstadoColuna("entrega", !!estado.entrega);
  aplicarEstadoColuna("finalizado", !!estado.finalizado);
}

function renderizarQuadro() {
  const filtrados = obterPedidosFiltrados();

  const pendentes = filtrados.filter((p) => p.status === "novo");
  const preparo = filtrados.filter(
    (p) => p.status === "aceito" || p.status === "preparo"
  );
  const entrega = filtrados.filter((p) => p.status === "saiu_entrega");
  const finalizados = filtrados.filter((p) => p.status === "finalizado");

  renderizarColuna("colPendente", pendentes);
  renderizarColuna("colPreparo", preparo);
  renderizarColuna("colEntrega", entrega);
  renderizarColuna("colFinalizado", finalizados);

  aplicarEstadoColunasSalvas();
}

function atualizarContadoresTempo() {
  const elementos = document.querySelectorAll(".js-tempo-decorrido");
  if (!elementos.length) return;

  elementos.forEach((el) => {
    const uid = el.getAttribute("data-pedido-uid");
    const pedido = buscarPedidoPorUid(uid);
    if (!pedido) return;
    el.textContent = tempoDecorridoTexto(pedido.dataObj);
  });
}

async function alterarStatusNoBanco(pedido, novoStatus) {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  if (!pedido) {
    throw new Error("Pedido inválido para atualização.");
  }

  if (
    pedido.bancoId === null ||
    pedido.bancoId === undefined ||
    Number.isNaN(Number(pedido.bancoId))
  ) {
    throw new Error("Pedido sem ID válido no banco.");
  }

  const statusNormalizado = normalizarStatus(novoStatus);

  const { data, error } = await supabaseClient
    .from(TABELA_PEDIDOS)
    .update({ status: statusNormalizado })
    .eq("id", Number(pedido.bancoId))
    .select();

  if (error) {
    console.error("Erro ao atualizar status no Supabase:", error);
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Nenhuma linha foi atualizada. Verifique RLS/policies ou o ID do pedido.");
  }

  return true;
}

async function alterarStatus(indice, novoStatus) {
  if (indice < 0 || indice >= pedidos.length) {
    alert("Índice do pedido inválido.");
    return;
  }

  try {
    const pedido = pedidos[indice];
    const statusNormalizado = normalizarStatus(novoStatus);

    if (supabaseClient) {
      await alterarStatusNoBanco(pedido, statusNormalizado);
      await carregarPedidos();
      return;
    }

    pedidos[indice].status = statusNormalizado;
    salvarPedidosStorage();
    atualizarResumo();
    renderizarQuadro();
  } catch (erro) {
    console.error("Falha ao alterar status:", erro);
    alert("Não foi possível atualizar o status do pedido.");
  }
}

async function excluirPedidoNoBanco(pedido) {
  if (!supabaseClient) {
    throw new Error("Supabase não configurado.");
  }

  if (!pedido) {
    throw new Error("Pedido inválido para exclusão.");
  }

  if (
    pedido.bancoId === null ||
    pedido.bancoId === undefined ||
    Number.isNaN(Number(pedido.bancoId))
  ) {
    throw new Error("Pedido sem ID válido no banco.");
  }

  const { error } = await supabaseClient
    .from(TABELA_PEDIDOS)
    .delete()
    .eq("id", Number(pedido.bancoId));

  if (error) {
    console.error("Erro ao excluir pedido no Supabase:", error);
    throw error;
  }

  return true;
}

async function excluirPedido(indice) {
  if (indice < 0 || indice >= pedidos.length) return;

  const pedido = pedidos[indice];
  if (!pedido) return;

  const identificador = pedido.id || pedido.bancoId || `pedido ${indice + 1}`;
  const confirmar = confirm(`Deseja realmente excluir o pedido ${identificador}?`);

  if (!confirmar) return;

  try {
    if (supabaseClient) {
      await excluirPedidoNoBanco(pedido);
      await carregarPedidos();
      return;
    }

    pedidos.splice(indice, 1);
    salvarPedidosStorage();
    atualizarResumo();
    renderizarQuadro();
  } catch (erro) {
    console.error("Falha ao excluir pedido:", erro);
    alert("Não foi possível excluir o pedido.");
  }
}

function limparTodosPedidos() {
  alert("Função desativada por segurança.");
}

function exportarPedidos() {
  const blob = new Blob([JSON.stringify(pedidos, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pedidos-chapa-lanches-dia.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function abrirWhatsapp(telefone) {
  window.open(`https://wa.me/${telefone}`, "_blank");
}

function buscarPedidoPorUid(uidPedido) {
  return pedidos.find((p) => p.uid === uidPedido);
}

function limparTextoImpressao(texto) {
  return String(texto || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function quebrarLinha48mm(texto, max = 32) {
  const textoLimpo = limparTextoImpressao(texto);
  if (!textoLimpo) return [""];

  const palavras = textoLimpo.split(" ");
  const linhas = [];
  let atual = "";

  for (const palavra of palavras) {
    const tentativa = (atual + " " + palavra).trim();

    if (tentativa.length <= max) {
      atual = tentativa;
    } else {
      if (atual) linhas.push(atual);

      if (palavra.length > max) {
        let restante = palavra;
        while (restante.length > max) {
          linhas.push(restante.slice(0, max));
          restante = restante.slice(max);
        }
        atual = restante;
      } else {
        atual = palavra;
      }
    }
  }

  if (atual) linhas.push(atual);

  return linhas.length ? linhas : [""];
}

function centralizar48mm(texto, largura = 32) {
  const valor = String(texto || "").trim();
  if (!valor) return "";
  if (valor.length >= largura) return valor;
  const espacos = Math.floor((largura - valor.length) / 2);
  return " ".repeat(espacos) + valor;
}

function linha48mm(char = "-") {
  return char.repeat(32);
}

function montarTextoRapido48mm(pedido) {
  const linhas = [];

  function valorItem(item) {
    return formatarMoedaRawBT(Number(item.preco || 0) * Number(item.quantidade || 1));
  }

  function limparNomeAdicional(nome) {
    return String(nome || "")
      .replace(/^adicional\s*:\s*/i, "")
      .replace(/^adicional\s+/i, "")
      .trim();
  }

  function ehAdicional(item) {
    const nome = String(item.nome || "").toLowerCase().trim();
    return nome.startsWith("adicional") || nome.includes("adicional:");
  }

  function montarLinhaPrincipal(item) {
    return `${item.quantidade}x ${item.nome}  ${valorItem(item)}`;
  }

  function montarLinhaAdicional(item) {
    const nome = limparNomeAdicional(item.nome);
    return `   + ${nome}  ${valorItem(item)}`;
  }

  linhas.push(centralizar48mm("CHAPA LANCHES"));
  linhas.push(centralizar48mm("COMANDA RAPIDA"));
  linhas.push("================================");
  linhas.push("");

  linhas.push(`PEDIDO: ${pedido.id}`);
  linhas.push(`CLIENTE: ${pedido.cliente}`);
  linhas.push(`HORA: ${formatarHora(pedido.dataObj)}`);
  linhas.push(`ENTREGA: ${pedido.tipoEntrega === "delivery" ? "DELIVERY" : "RETIRADA"}`);

  linhas.push("");
  linhas.push("--------------------------------");

  const ruaBase = String((pedido.endereco || "").split(",")[0] || "-").trim();
  linhas.push(`RUA: ${ruaBase}`);

  const numeroBase = String(
    pedido.numero ||
      ((pedido.endereco || "").split(",")[1] || "").trim() ||
      "-"
  ).trim();

  linhas.push(`NUMERO: ${numeroBase}`);
  linhas.push(`BAIRRO: ${pedido.bairro || "-"}`);

  if (pedido.complemento) {
    linhas.push(`COMPLEMENTO: ${pedido.complemento}`);
  }

  linhas.push("");
  linhas.push("--------------------------------");
  linhas.push("ITENS DO PEDIDO");
  linhas.push("");

  if (pedido.itens.length) {
    pedido.itens.forEach((item) => {
      if (ehAdicional(item)) {
        linhas.push(montarLinhaAdicional(item));

        if (item.observacao) {
          linhas.push(`      > ${String(item.observacao).toUpperCase()}`);
        }

        return;
      }

      linhas.push(montarLinhaPrincipal(item));

      if (item.observacao) {
        linhas.push(`   > ${String(item.observacao).toUpperCase()}`);
      }

      linhas.push("");
    });
  } else {
    linhas.push("Nenhum item.");
    linhas.push("");
  }

  linhas.push("--------------------------------");
  linhas.push(`PAGAMENTO: ${pedido.pagamento}`);

  if (pedido.observacao) {
    linhas.push("");
    linhas.push("OBSERVAÇÃO DO PEDIDO:");
    linhas.push(`   > ${pedido.observacao}`);
  }

  linhas.push("");
  linhas.push("--------------------------------");

  if (pedido.tipoEntrega === "delivery") {
    linhas.push(`TAXA ENTREGA: ${formatarMoedaRawBT(pedido.taxaEntrega)}`);
  }

  linhas.push(`TOTAL: ${formatarMoedaRawBT(pedido.total)}`);
  linhas.push("");
  linhas.push("");
  linhas.push("");

  return linhas.join("\n");
}

function montarTextoCompleto48mm(pedido) {
  const linhas = [];

  linhas.push(centralizar48mm("CHAPA LANCHES"));
  linhas.push(centralizar48mm("PEDIDO COMPLETO"));
  linhas.push(linha48mm());
  linhas.push(`PEDIDO: ${pedido.id}`);
  linhas.push(`CLIENTE: ${pedido.cliente}`);
  linhas.push(`TEL: ${pedido.telefone || "-"}`);
  linhas.push(`DATA: ${pedido.dataTexto}`);
  linhas.push(`TIPO: ${pedido.tipoEntrega === "delivery" ? "DELIVERY" : "RETIRADA"}`);
  linhas.push(`STATUS: ${statusLabel(pedido.status).toUpperCase()}`);
  linhas.push(`PAGTO: ${pedido.pagamento}`);
  if (pedido.troco) linhas.push(`TROCO: ${pedido.troco}`);

  linhas.push(linha48mm());
  linhas.push("ENDERECO:");
  quebrarLinha48mm(`RUA: ${pedido.endereco || "-"}`).forEach((linha) => linhas.push(linha));
  linhas.push(`NUM: ${pedido.numero || "-"}`);
  quebrarLinha48mm(`BAIRRO: ${pedido.bairro || "-"}`).forEach((linha) => linhas.push(linha));
  quebrarLinha48mm(`CIDADE: ${pedido.cidade || "-"}`).forEach((linha) => linhas.push(linha));
  quebrarLinha48mm(`COMP: ${pedido.complemento || "-"}`).forEach((linha) => linhas.push(linha));

  linhas.push(linha48mm());
  linhas.push("ITENS:");

  if (pedido.itens.length) {
    pedido.itens.forEach((item) => {
      quebrarLinha48mm(`${item.quantidade}x ${item.nome}`).forEach((linha) => linhas.push(linha));
      linhas.push(`UNIT: ${formatarMoedaRawBT(item.preco)}`);
      linhas.push(`TOTAL ITEM: ${formatarMoedaRawBT(item.preco * item.quantidade)}`);
      if (item.observacao) {
        quebrarLinha48mm(`OBS: ${item.observacao}`).forEach((linha) => linhas.push(linha));
      }
      linhas.push(linha48mm());
    });
  } else {
    linhas.push("Nenhum item.");
    linhas.push(linha48mm());
  }

  linhas.push(`SUBTOTAL: ${formatarMoedaRawBT(pedido.subtotal)}`);
  linhas.push(`TAXA: ${formatarMoedaRawBT(pedido.taxaEntrega)}`);
  linhas.push(`TOTAL: ${formatarMoedaRawBT(pedido.total)}`);

  if (pedido.observacao) {
    linhas.push(linha48mm());
    quebrarLinha48mm(`OBS GERAL: ${pedido.observacao}`).forEach((linha) => linhas.push(linha));
  }

  linhas.push("");
  linhas.push("");
  linhas.push("");

  return linhas.join("\n");
}

function montarHtmlBaseImpressao(titulo, textoPlano, autoPrint = true) {
  const textoSeguro = escaparHtml(textoPlano);

  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${escaparHtml(titulo)}</title>
        <style>
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          @page {
            size: 48mm auto;
            margin: 0;
          }

          html, body {
            width: 48mm;
            min-width: 48mm;
            max-width: 48mm;
            margin: 0;
            padding: 0;
            background: #fff;
            overflow-x: hidden;
          }

          body {
            font-family: monospace;
            color: #000;
            font-size: 11px;
            line-height: 1.25;
            padding: 3mm;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .ticket {
            width: 42mm;
          }

          @media print {
            html, body {
              width: 48mm !important;
              min-width: 48mm !important;
              max-width: 48mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="ticket">${textoSeguro}</div>
        ${
          autoPrint
            ? `<script>
                window.onload = function () {
                  setTimeout(function () {
                    window.print();
                  }, 250);
                };
              <\/script>`
            : ""
        }
      </body>
    </html>
  `;
}

function imprimirPedidoCompleto(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const janela = window.open("", "_blank", "width=420,height=700");
  if (!janela) {
    alert("O navegador bloqueou a janela de impressão. Libere o pop-up e tente novamente.");
    return;
  }

  const texto = montarTextoCompleto48mm(pedido);
  const html = montarHtmlBaseImpressao(`Impressão - ${pedido.id}`, texto);

  janela.document.write(html);
  janela.document.close();
}

function imprimirPedidoRapido(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const janela = window.open("", "_blank", "width=420,height=700");
  if (!janela) {
    alert("O navegador bloqueou a janela de impressão. Libere o pop-up e tente novamente.");
    return;
  }

  const texto = montarTextoRapido48mm(pedido);
  const html = montarHtmlBaseImpressao(`Comanda - ${pedido.id}`, texto);

  janela.document.write(html);
  janela.document.close();
}

function normalizarTextoParaRawBT(texto) {
  return String(texto || "")
    // espaços especiais
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ")
    .replace(/\u2007/g, " ")
    .replace(/\u2060/g, "")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")

    // aspas e traços
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—−]/g, "-")

    // reticências e bullets
    .replace(/\.\.\./g, "...")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")

    // símbolos que costumam dar problema
    .replace(/№/g, "No")
    .replace(/º/g, "o")
    .replace(/ª/g, "a")
    .replace(/°/g, "o")
    .replace(/€/g, "EUR")
    .replace(/£/g, "GBP")
    .replace(/¥/g, "YEN")
    .replace(/¢/g, "cent")
    .replace(/®/g, "")
    .replace(/©/g, "")
    .replace(/™/g, "")

    // setas e afins
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/⇒/g, "=>")
    .replace(/✓/g, "OK")
    .replace(/✔/g, "OK")
    .replace(/✖/g, "X")
    .replace(/×/g, "x")

    // remove lixos comuns de encoding
    .replace(/Â/g, "")
    .replace(/Ã/g, "")

    // moeda
    .replace(/R\$/g, "R$")

    // normaliza acentos
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

    // cedilha depois da normalização
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")

    // tabs e quebras estranhas
    .replace(/\t/g, " ")
    .replace(/\r/g, "")

    // junta múltiplos espaços, mas preserva quebra de linha
    .replace(/[ ]{2,}/g, " ")

    // remove qualquer coisa fora do ASCII imprimível + quebra de linha
    .replace(/[^\x0A\x0D\x20-\x7E]/g, "");
}

function encodeRawBT(texto) {
  return btoa(texto);
}

function abrirRawBT(texto) {
  try {
    const ESC = "\x1B";
    const textoSeguro = normalizarTextoParaRawBT(texto);

    const comandos = ESC + "@";
    const textoFinal = comandos + textoSeguro + "\n\n\n";

    const base64 = encodeRawBT(textoFinal);
    const url = "rawbt:base64," + base64;

    window.location.href = url;
  } catch (erro) {
    console.error("Erro RawBT:", erro);
    alert("Erro ao imprimir.");
  }
}

function imprimirPedidoRawBT(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const texto = montarTextoRapido48mm(pedido);
  abrirRawBT(texto);
}

function imprimirPedido(uidPedido) {
  imprimirPedidoCompleto(uidPedido);
}

function copiarPedido(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const texto = `
Pedido ${pedido.id}
Cliente: ${pedido.cliente}
Telefone: ${pedido.telefone || "-"}
Entrega: ${pedido.tipoEntrega === "delivery" ? "Delivery" : "Retirada"}
Status: ${statusLabel(pedido.status)}
Endereço: ${pedido.endereco || "-"}, ${pedido.numero || "-"} - ${pedido.bairro || "-"}${
    pedido.complemento ? " - " + pedido.complemento : ""
  }
Pagamento: ${pedido.pagamento}
Troco: ${pedido.troco || "-"}
Itens:
${pedido.itens
  .map(
    (item) =>
      `- ${item.quantidade}x ${item.nome} (${formatarMoeda(
        item.preco * item.quantidade
      )})${item.observacao ? " | Obs.: " + item.observacao : ""}`
  )
  .join("\n")}
Subtotal: ${formatarMoeda(pedido.subtotal)}
Taxa: ${formatarMoeda(pedido.taxaEntrega)}
Total: ${formatarMoeda(pedido.total)}
Observação: ${pedido.observacao || "-"}
  `.trim();

  if (!navigator.clipboard) {
    alert("Seu navegador não permite cópia automática.");
    return;
  }

  navigator.clipboard
    .writeText(texto)
    .then(() => alert("Pedido copiado com sucesso."))
    .catch(() => alert("Não foi possível copiar o pedido."));
}

function tocarNotificacaoNovoPedido() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function beep(freq, start, duration) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "square";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(1.0, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(start);
      osc.stop(start + duration);
    }

    const now = audioCtx.currentTime;

    beep(1500, now, 0.25);
    beep(1700, now + 0.30, 0.25);
    beep(1900, now + 0.60, 0.35);
  } catch (e) {
    console.log("Não foi possível tocar notificação.");
  }
}

function atualizarRelogio() {
  const el = byId("clockAtual");
  if (!el) return;

  const agora = new Date();
  el.textContent = agora.toLocaleTimeString("pt-BR");
}

function obterConfiguracaoLojaPadrao() {
  return {
    id: STORE_SETTINGS_ID,
    open_time: "19:00:00",
    close_time: "22:30:00",
    auto_open: true,
    manual_force_open: false,
    manual_force_closed: false
  };
}

function converterHorarioParaMinutos(horario) {
  if (!horario) return null;

  const partes = String(horario).split(":");
  const hora = Number(partes[0] || 0);
  const minuto = Number(partes[1] || 0);

  return hora * 60 + minuto;
}

function obterStatusAutomaticoLoja(config = null) {
  const agora = new Date();
  const diaSemana = agora.getDay();
  const horarioAtual = agora.getHours() * 60 + agora.getMinutes();

  const diasPermitidos = [0, 3, 4, 5, 6];
  const abertura = converterHorarioParaMinutos(config?.open_time) ?? 19 * 60;
  const fechamento = converterHorarioParaMinutos(config?.close_time) ?? (22 * 60 + 30);

  return (
    diasPermitidos.includes(diaSemana) &&
    horarioAtual >= abertura &&
    horarioAtual <= fechamento
  );
}

async function carregarConfiguracaoLoja() {
  if (!supabaseClient) {
    configuracaoLoja = obterConfiguracaoLojaPadrao();
    return configuracaoLoja;
  }

  try {
    const { data, error } = await supabaseClient
      .from(TABELA_CONFIG_LOJA)
      .select("*")
      .eq("id", STORE_SETTINGS_ID)
      .single();

    if (error) {
      console.error("Erro ao carregar configuração da loja:", error);
      configuracaoLoja = obterConfiguracaoLojaPadrao();
      return configuracaoLoja;
    }

    configuracaoLoja = {
      ...obterConfiguracaoLojaPadrao(),
      ...(data || {})
    };

    return configuracaoLoja;
  } catch (erro) {
    console.error("Falha ao carregar configuração da loja:", erro);
    configuracaoLoja = obterConfiguracaoLojaPadrao();
    return configuracaoLoja;
  }
}

async function atualizarConfiguracaoLojaStatus() {
  if (!supabaseClient) {
    if (!configuracaoLoja) {
      configuracaoLoja = obterConfiguracaoLojaPadrao();
    }
    return configuracaoLoja;
  }

  try {
    const { data, error } = await supabaseClient
      .from(TABELA_CONFIG_LOJA)
      .select("id, open_time, close_time, auto_open, manual_force_open, manual_force_closed, updated_at")
      .eq("id", STORE_SETTINGS_ID)
      .single();

    if (error) {
      console.error("Erro ao atualizar status da loja:", error);
      return configuracaoLoja || obterConfiguracaoLojaPadrao();
    }

    configuracaoLoja = {
      ...(configuracaoLoja || obterConfiguracaoLojaPadrao()),
      ...(data || {})
    };

    return configuracaoLoja;
  } catch (erro) {
    console.error("Falha ao atualizar status da loja:", erro);
    return configuracaoLoja || obterConfiguracaoLojaPadrao();
  }
}

function obterModoLoja(config) {
  if (!config) return "automatico";
  if (config.manual_force_open === true) return "aberta";
  if (config.manual_force_closed === true) return "fechada";
  return "automatico";
}

async function lojaEstaAbertaAgora() {
  const config = await atualizarConfiguracaoLojaStatus();

  if (!config) return false;

  if (config.manual_force_open === true) return true;
  if (config.manual_force_closed === true) return false;
  if (config.auto_open === true) return obterStatusAutomaticoLoja(config);

  return false;
}

async function carregarStatusLoja() {
  const config = await atualizarConfiguracaoLojaStatus();
  const aberta = await lojaEstaAbertaAgora();
  const modo = obterModoLoja(config);
  aplicarStatusLoja(aberta, modo);
}

function aplicarStatusLoja(aberta, modo = "automatico") {
  const btn = byId("btnToggleLoja");
  const btnAuto = byId("btnModoAutomatico");

  if (!btn) return;

  btn.classList.remove("aberta", "fechada");

  if (aberta) {
    btn.classList.add("aberta");
    btn.textContent = "Aberta";
  } else {
    btn.classList.add("fechada");
    btn.textContent = "Fechada";
  }

  if (btnAuto) {
    btnAuto.classList.remove("ativo");

    if (modo === "automatico") {
      btnAuto.classList.add("ativo");
      btnAuto.textContent = "Automático ✓";
    } else {
      btnAuto.textContent = "Automático";
    }
  }

  if (modo === "automatico") {
    btn.title = "Modo automático (horário)";
  } else if (modo === "aberta") {
    btn.title = "Aberta manualmente";
  } else if (modo === "fechada") {
    btn.title = "Fechada manualmente";
  }
}

async function definirModoLoja(modo) {
  if (!supabaseClient) {
    alert("Supabase não configurado.");
    return;
  }

  let payload = null;

  if (modo === "automatico") {
    payload = {
      auto_open: true,
      manual_force_open: false,
      manual_force_closed: false,
      updated_at: new Date().toISOString()
    };
  } else if (modo === "aberta") {
    payload = {
      auto_open: false,
      manual_force_open: true,
      manual_force_closed: false,
      updated_at: new Date().toISOString()
    };
  } else if (modo === "fechada") {
    payload = {
      auto_open: false,
      manual_force_open: false,
      manual_force_closed: true,
      updated_at: new Date().toISOString()
    };
  } else {
    return;
  }

  const { error } = await supabaseClient
    .from(TABELA_CONFIG_LOJA)
    .update(payload)
    .eq("id", STORE_SETTINGS_ID);

  if (error) {
    console.error("Erro ao definir modo da loja:", error);
    alert("Não foi possível atualizar o modo da loja.");
    return;
  }

  await carregarStatusLoja();
}

async function alternarStatusLoja() {
  if (!supabaseClient) {
    alert("Supabase não configurado.");
    return;
  }

  try {
    const abertaAgora = await lojaEstaAbertaAgora();
    const novoStatus = !abertaAgora;

    const { error } = await supabaseClient
      .from(TABELA_CONFIG_LOJA)
      .update({
        auto_open: false,
        manual_force_open: novoStatus,
        manual_force_closed: !novoStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", STORE_SETTINGS_ID);

    if (error) {
      console.error("Erro ao atualizar status da loja:", error);
      alert("Não foi possível atualizar o status da loja.");
      return;
    }

    await carregarStatusLoja();
  } catch (erro) {
    console.error("Falha ao alternar status da loja:", erro);
    alert("Não foi possível atualizar o status da loja.");
  }
}

async function removerOverrideLoja() {
  await definirModoLoja("automatico");
}

function sairDoPainel() {
  const confirmar = confirm("Deseja sair do painel admin?");
  if (!confirmar) return;

  localStorage.removeItem(LOGIN_STORAGE_KEY);
  window.location.href = "login.html";
}

function esconderBotaoApagarTudo() {
  const btn = byId("btnLimparTudo");
  if (!btn) return;

  btn.style.display = "none";
  btn.disabled = true;
  btn.removeAttribute("onclick");
}

function iniciarRealtimeSupabase() {
  if (!supabaseClient) return;

  try {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = supabaseClient
      .channel("orders-realtime-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABELA_PEDIDOS },
        async (payload) => {
          console.log("Mudança recebida do Supabase:", payload);
          await carregarPedidos(payload?.eventType === "INSERT");
        }
      )
      .subscribe((status) => {
        console.log("Status realtime Supabase:", status);
      });
  } catch (erro) {
    console.error("Erro ao iniciar realtime do Supabase:", erro);
  }
}

const btnAtualizar = byId("btnAtualizar");
const btnExportar = byId("btnExportar");
const btnLimparTudo = byId("btnLimparTudo");
const btnToggleLoja = byId("btnToggleLoja");
const btnModoAutomatico = byId("btnModoAutomatico");
const btnSair = byId("btnSair");
const buscaPedido = byId("buscaPedido");
const filtroStatus = byId("filtroStatus");
const filtroTipo = byId("filtroTipo");
const ordenacao = byId("ordenacao");

if (btnAtualizar) btnAtualizar.addEventListener("click", () => carregarPedidos());
if (btnExportar) btnExportar.addEventListener("click", exportarPedidos);

if (btnLimparTudo) {
  btnLimparTudo.removeEventListener("click", limparTodosPedidos);
  btnLimparTudo.style.display = "none";
  btnLimparTudo.disabled = true;
}

if (btnToggleLoja) {
  btnToggleLoja.addEventListener("click", async () => {
    await alternarStatusLoja();
  });
}

if (btnModoAutomatico) {
  btnModoAutomatico.addEventListener("click", async () => {
    await removerOverrideLoja();
  });
}

if (btnSair) btnSair.addEventListener("click", sairDoPainel);
if (buscaPedido) buscaPedido.addEventListener("input", renderizarQuadro);
if (filtroStatus) filtroStatus.addEventListener("change", renderizarQuadro);
if (filtroTipo) filtroTipo.addEventListener("change", renderizarQuadro);
if (ordenacao) ordenacao.addEventListener("change", renderizarQuadro);

window.addEventListener("beforeunload", () => {
  try {
    if (supabaseClient && realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
    }
  } catch (e) {}
});

window.alterarStatus = alterarStatus;
window.excluirPedido = excluirPedido;
window.abrirWhatsapp = abrirWhatsapp;
window.imprimirPedido = imprimirPedido;
window.imprimirPedidoCompleto = imprimirPedidoCompleto;
window.imprimirPedidoRapido = imprimirPedidoRapido;
window.imprimirPedidoRawBT = imprimirPedidoRawBT;
window.copiarPedido = copiarPedido;
window.toggleColuna = toggleColuna;

console.log("ADMIN JS NOVO CARREGADO - MOSTRANDO APENAS PEDIDOS DO DIA E LIMPANDO NA VIRADA");

(async function iniciarAdmin() {
  esconderBotaoApagarTudo();
  await carregarConfiguracaoLoja();
  await carregarStatusLoja();
  await carregarPedidos();
  iniciarRealtimeSupabase();
  atualizarRelogio();
  aplicarEstadoColunasSalvas();

  setInterval(atualizarRelogio, 1000);
  setInterval(atualizarContadoresTempo, 30000);
  setInterval(async () => {
    verificarViradaDeDia();
    await carregarPedidos();
    await carregarStatusLoja();
  }, 5000);
})();
