let pedidos = [];
let ultimaQuantidadePedidos = 0;

const STORAGE_KEYS = ["pedidos", "chapa_pedidos", "pedidos_chapa"];
const LOJA_STATUS_KEY = "chapa_loja_aberta";
const LOJA_OVERRIDE_KEY = "chapa_loja_override";
const LOGIN_STORAGE_KEY = "chapa_admin_logado";

let supabaseClient = null;
let realtimeChannel = null;
let carregandoPedidos = false;
let ultimoHashPedidos = "";

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

function normalizarTipoEntrega(valor) {
  const texto = String(valor || "").toLowerCase();

  if (texto.includes("retirada")) return "retirada";
  if (texto.includes("delivery")) return "delivery";
  if (texto.includes("entrega")) return "delivery";

  return texto || "não informado";
}

function normalizarStatus(valor) {
  const texto = String(valor || "").toLowerCase().trim();

  if (texto === "novo") return "pendente";
  if (texto === "pendente") return "pendente";
  if (texto === "em preparo") return "em preparo";
  if (texto === "em entrega") return "em entrega";
  if (texto === "finalizado") return "finalizado";

  return "pendente";
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

  const id = pedido.id || gerarId(index);
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

  const bancoIdNormalizado =
    pedido.bancoId ??
    pedido.id ??
    pedido.uuid ??
    pedido.order_id ??
    pedido.orderId ??
    null;

  return {
    uid: gerarUidPedido({ id }, index, dataObj),
    id,
    bancoId: bancoIdNormalizado,
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

async function buscarPedidosDoBanco() {
  if (!supabaseClient) return null;

  const { data, error } = await supabaseClient
    .from("orders")
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
    let pedidosBrutos = [];

    if (supabaseClient) {
      pedidosBrutos = await buscarPedidosDoBanco();
    } else {
      const dados = obterPedidosStorage();
      pedidosBrutos = Array.isArray(dados.pedidos) ? dados.pedidos : [];
    }

    const quantidadeAnterior = ultimaQuantidadePedidos;
    const pedidosNormalizados = pedidosBrutos.map((pedido, index) =>
      normalizarPedido(pedido, index)
    );

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
    pedidos = pedidosBrutos.map((pedido, index) => normalizarPedido(pedido, index));
    ultimaQuantidadePedidos = pedidos.length;
    ultimoHashPedidos = gerarHashPedidos(pedidos);

    atualizarResumo();
    renderizarQuadro();
  } finally {
    carregandoPedidos = false;
  }
}

function atualizarResumo() {
  const hoje = new Date();

  const pedidosHojeLista = pedidos.filter(
    (p) => p.dataObj.toDateString() === hoje.toDateString()
  );

  const faturamento = pedidosHojeLista.reduce(
    (acc, pedido) => acc + Number(pedido.total || 0),
    0
  );
  const ticket = pedidosHojeLista.length
    ? faturamento / pedidosHojeLista.length
    : 0;
  const delivery = pedidos.filter((p) => p.tipoEntrega === "delivery").length;
  const retirada = pedidos.filter((p) => p.tipoEntrega === "retirada").length;
  const pendentes = pedidos.filter((p) => p.status === "pendente").length;
  const preparo = pedidos.filter((p) => p.status === "em preparo").length;
  const entrega = pedidos.filter((p) => p.status === "em entrega").length;
  const finalizados = pedidos.filter((p) => p.status === "finalizado").length;

  if (byId("totalPedidos")) byId("totalPedidos").textContent = pedidos.length;
  if (byId("pedidosHoje")) byId("pedidosHoje").textContent = pedidosHojeLista.length;
  if (byId("faturamentoDia")) byId("faturamentoDia").textContent = formatarMoeda(faturamento);
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
      ${pedido.cliente}
      ${pedido.telefone}
      ${pedido.entrega}
      ${pedido.tipoEntrega}
      ${pedido.endereco}
      ${pedido.numero}
      ${pedido.bairro}
      ${pedido.complemento}
      ${pedido.pagamento}
      ${pedido.observacao}
    `.toLowerCase();

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

  if (pedido.status === "pendente" && diffMin >= 10) return true;
  if (pedido.status === "em preparo" && diffMin >= 25) return true;
  if (pedido.status === "em entrega" && diffMin >= 40) return true;

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
  if (statusAtual === "pendente") {
    return `<button class="btn btn-yellow btn-small full-width" onclick="alterarStatus(${indice}, 'em preparo')">Aceitar / Iniciar preparo</button>`;
  }

  if (statusAtual === "em preparo") {
    return `<button class="btn btn-blue btn-small full-width" onclick="alterarStatus(${indice}, 'em entrega')">Saiu para entrega</button>`;
  }

  if (statusAtual === "em entrega") {
    return `<button class="btn btn-green btn-small full-width" onclick="alterarStatus(${indice}, 'finalizado')">Finalizar pedido</button>`;
  }

  return `<button class="btn btn-dark btn-small full-width" onclick="alterarStatus(${indice}, 'pendente')">Reabrir pedido</button>`;
}

function criarCardPedido(pedido) {
  const indiceReal = pedidos.findIndex((p) => p.uid === pedido.uid);
  const telefoneLimpo = String(pedido.telefone || "").replace(/\D/g, "");
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
          <span class="badge badge-time js-tempo-decorrido" data-pedido-uid="${escaparHtml(pedido.uid)}">${escaparHtml(
    tempoDecorridoTexto(pedido.dataObj)
  )}</span>
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
          <div class="line"><strong>Telefone:</strong> ${escaparHtml(
            pedido.telefone || "Não informado"
          )}</div>
          ${pedido.troco ? `<div class="line"><strong>Troco:</strong> ${escaparHtml(pedido.troco)}</div>` : ""}
        </div>

        <div class="mini-block">
          <h4>Endereço</h4>
          <div class="line"><strong>Rua:</strong> ${escaparHtml(pedido.endereco || "Não informado")}</div>
          <div class="line"><strong>Número:</strong> ${escaparHtml(pedido.numero || "-")}</div>
          <div class="line"><strong>Bairro:</strong> ${escaparHtml(pedido.bairro || "-")}</div>
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
          <option value="pendente" ${pedido.status === "pendente" ? "selected" : ""}>Pendente</option>
          <option value="em preparo" ${pedido.status === "em preparo" ? "selected" : ""}>Em preparo</option>
          <option value="em entrega" ${pedido.status === "em entrega" ? "selected" : ""}>Em entrega</option>
          <option value="finalizado" ${pedido.status === "finalizado" ? "selected" : ""}>Finalizado</option>
        </select>

        <div class="action-grid">
          ${
            telefoneLimpo
              ? `<button class="btn btn-green btn-small" onclick="abrirWhatsapp('${telefoneLimpo}')">WhatsApp</button>`
              : `<button class="btn btn-dark btn-small" disabled>Sem WhatsApp</button>`
          }
          <button class="btn btn-dark btn-small" onclick="imprimirPedidoCompleto('${pedido.uid}')">Impressão completa</button>
          <button class="btn btn-yellow btn-small" onclick="imprimirPedidoRapido('${pedido.uid}')">Impressão rápida</button>
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

function renderizarQuadro() {
  const filtrados = obterPedidosFiltrados();

  const pendentes = filtrados.filter((p) => p.status === "pendente");
  const preparo = filtrados.filter((p) => p.status === "em preparo");
  const entrega = filtrados.filter((p) => p.status === "em entrega");
  const finalizados = filtrados.filter((p) => p.status === "finalizado");

  renderizarColuna("colPendente", pendentes);
  renderizarColuna("colPreparo", preparo);
  renderizarColuna("colEntrega", entrega);
  renderizarColuna("colFinalizado", finalizados);
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
  if (!supabaseClient || !pedido || !pedido.bancoId) return false;

  const { error } = await supabaseClient
    .from("orders")
    .update({ status: novoStatus })
    .eq("id", pedido.bancoId);

  if (error) {
    console.error("Erro ao atualizar status no Supabase:", error);
    throw error;
  }

  return true;
}

async function alterarStatus(indice, novoStatus) {
  if (indice < 0 || indice >= pedidos.length) return;

  try {
    const pedido = pedidos[indice];
    const statusNormalizado = normalizarStatus(novoStatus);

    if (supabaseClient && pedido.bancoId) {
      await alterarStatusNoBanco(pedido, statusNormalizado);
      await carregarPedidos();
      return;
    }

    pedidos[indice].status = statusNormalizado;
    salvarPedidosStorage();
    atualizarResumo();
    renderizarQuadro();
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível atualizar o status do pedido.");
  }
}

async function excluirPedidoNoBanco(pedido) {
  if (!supabaseClient || !pedido || !pedido.bancoId) return false;

  const { error } = await supabaseClient
    .from("orders")
    .delete()
    .eq("id", pedido.bancoId);

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
  const confirmacaoTexto = prompt(
    `Exclusão segura\n\nDigite EXCLUIR para remover o pedido ${identificador}:`
  );

  if (confirmacaoTexto !== "EXCLUIR") {
    alert("Exclusão cancelada.");
    return;
  }

  try {
    if (supabaseClient && pedido.bancoId) {
      await excluirPedidoNoBanco(pedido);
      await carregarPedidos();
      return;
    }

    pedidos.splice(indice, 1);
    salvarPedidosStorage();
    atualizarResumo();
    renderizarQuadro();
  } catch (erro) {
    console.error(erro);
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
  a.download = "pedidos-chapa-lanches.json";
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

function montarHtmlBaseImpressao(titulo, conteudo, autoPrint = true) {
  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${escaparHtml(titulo)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            padding: 18px;
            color: #000;
            font-size: 13px;
          }
          h1, h2, h3 { margin: 0 0 10px 0; }
          h1 { font-size: 22px; }
          h2 {
            margin-top: 18px;
            border-bottom: 1px solid #000;
            padding-bottom: 4px;
            font-size: 15px;
          }
          p { margin: 4px 0; }
          .linha { margin: 4px 0; }
          .item {
            border-bottom: 1px dashed #999;
            padding: 6px 0;
          }
          .item:last-child {
            border-bottom: 0;
          }
          .total {
            margin-top: 12px;
            font-size: 18px;
            font-weight: bold;
          }
          .mini {
            font-size: 12px;
          }
          .center {
            text-align: center;
          }
          @media print {
            body { margin: 0; padding: 10px; }
          }
        </style>
      </head>
      <body>
        ${conteudo}
        ${
          autoPrint
            ? `<script>window.onload = function(){ window.print(); };<\/script>`
            : ""
        }
      </body>
    </html>
  `;
}

function imprimirPedidoCompleto(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const janela = window.open("", "_blank", "width=900,height=700");
  if (!janela) return;

  const html = montarHtmlBaseImpressao(
    `Impressão - ${pedido.id}`,
    `
      <h1>Chapa Lanches</h1>
      <p><strong>Pedido:</strong> ${escaparHtml(pedido.id)}</p>
      <p><strong>Cliente:</strong> ${escaparHtml(pedido.cliente)}</p>
      <p><strong>Telefone:</strong> ${escaparHtml(pedido.telefone || "-")}</p>
      <p><strong>Data/Hora:</strong> ${escaparHtml(pedido.dataTexto)}</p>
      <p><strong>Entrega:</strong> ${escaparHtml(
        pedido.tipoEntrega === "delivery" ? "Delivery" : "Retirada"
      )}</p>
      <p><strong>Pagamento:</strong> ${escaparHtml(pedido.pagamento)}</p>
      <p><strong>Troco:</strong> ${escaparHtml(pedido.troco || "-")}</p>
      <p><strong>Status:</strong> ${escaparHtml(pedido.status)}</p>

      <h2>Endereço</h2>
      <p><strong>Rua:</strong> ${escaparHtml(pedido.endereco || "-")}</p>
      <p><strong>Número:</strong> ${escaparHtml(pedido.numero || "-")}</p>
      <p><strong>Bairro:</strong> ${escaparHtml(pedido.bairro || "-")}</p>
      <p><strong>Complemento:</strong> ${escaparHtml(pedido.complemento || "-")}</p>

      <h2>Itens</h2>
      ${pedido.itens
        .map(
          (item) => `
        <div class="item">
          <p><strong>${escaparHtml(item.quantidade)}x ${escaparHtml(item.nome)}</strong></p>
          <p>Unitário: ${formatarMoeda(item.preco)}</p>
          <p>Total item: ${formatarMoeda(item.preco * item.quantidade)}</p>
          ${item.observacao ? `<p>Obs.: ${escaparHtml(item.observacao)}</p>` : ""}
        </div>
      `
        )
        .join("")}

      <h2>Resumo</h2>
      <p><strong>Subtotal:</strong> ${formatarMoeda(pedido.subtotal)}</p>
      <p><strong>Taxa:</strong> ${formatarMoeda(pedido.taxaEntrega)}</p>
      <p class="total">Total: ${formatarMoeda(pedido.total)}</p>

      <h2>Observação</h2>
      <p>${escaparHtml(pedido.observacao || "-")}</p>
    `
  );

  janela.document.write(html);
  janela.document.close();
}

function imprimirPedidoRapido(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const janela = window.open("", "_blank", "width=420,height=700");
  if (!janela) return;

  const html = montarHtmlBaseImpressao(
    `Comanda - ${pedido.id}`,
    `
      <div class="center">
        <h1>CHAPA LANCHES</h1>
        <p class="mini">Comanda rápida</p>
      </div>

      <hr>

      <div class="linha"><strong>Pedido:</strong> ${escaparHtml(pedido.id)}</div>
      <div class="linha"><strong>Cliente:</strong> ${escaparHtml(pedido.cliente)}</div>
      <div class="linha"><strong>Hora:</strong> ${escaparHtml(formatarHora(pedido.dataObj))}</div>
      <div class="linha"><strong>Entrega:</strong> ${escaparHtml(
        pedido.tipoEntrega === "delivery" ? "Delivery" : "Retirada"
      )}</div>

      ${
        pedido.tipoEntrega === "delivery"
          ? `
        <div class="linha"><strong>Endereço:</strong> ${escaparHtml(
          `${pedido.endereco || "-"}, ${pedido.numero || "-"}`
        )}</div>
        <div class="linha"><strong>Bairro:</strong> ${escaparHtml(pedido.bairro || "-")}</div>
        ${
          pedido.complemento
            ? `<div class="linha"><strong>Comp.:</strong> ${escaparHtml(pedido.complemento)}</div>`
            : ""
        }
      `
          : ""
      }

      <h2>Itens</h2>
      ${pedido.itens
        .map(
          (item) => `
        <div class="item">
          <p><strong>${escaparHtml(item.quantidade)}x ${escaparHtml(item.nome)}</strong></p>
          ${item.observacao ? `<p class="mini">Obs.: ${escaparHtml(item.observacao)}</p>` : ""}
        </div>
      `
        )
        .join("")}

      <h2>Pagamento</h2>
      <p><strong>Forma:</strong> ${escaparHtml(pedido.pagamento)}</p>
      ${pedido.troco ? `<p><strong>Troco:</strong> ${escaparHtml(pedido.troco)}</p>` : ""}

      ${pedido.observacao ? `<h2>Obs.</h2><p>${escaparHtml(pedido.observacao)}</p>` : ""}

      <hr>
      <p class="total center">TOTAL: ${formatarMoeda(pedido.total)}</p>
    `
  );

  janela.document.write(html);
  janela.document.close();
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
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
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

function obterStatusAutomaticoLoja() {
  const agora = new Date();
  const hora = agora.getHours();
  const minuto = agora.getMinutes();

  const horarioAtual = hora * 60 + minuto;
  const abertura = 19 * 60;
  const fechamento = 22 * 60 + 30;

  return horarioAtual >= abertura && horarioAtual <= fechamento;
}

function carregarStatusLoja() {
  const override = localStorage.getItem(LOJA_OVERRIDE_KEY);

  if (override === "aberta") {
    aplicarStatusLoja(true, true);
    return;
  }

  if (override === "fechada") {
    aplicarStatusLoja(false, true);
    return;
  }

  aplicarStatusLoja(obterStatusAutomaticoLoja(), false);
}

function aplicarStatusLoja(aberta, manual = false) {
  const btn = byId("btnToggleLoja");
  if (!btn) return;

  btn.classList.remove("aberta", "fechada");

  if (aberta) {
    btn.classList.add("aberta");
    btn.textContent = manual ? "Aberta (manual)" : "Aberta";
    localStorage.setItem(LOJA_STATUS_KEY, "true");
  } else {
    btn.classList.add("fechada");
    btn.textContent = manual ? "Fechada (manual)" : "Fechada";
    localStorage.setItem(LOJA_STATUS_KEY, "false");
  }
}

function alternarStatusLoja() {
  const statusAtual = localStorage.getItem(LOJA_STATUS_KEY) === "true";
  const novoStatus = !statusAtual;

  const confirmar = confirm(
    novoStatus
      ? "Deseja abrir a loja manualmente?"
      : "Deseja fechar a loja manualmente?"
  );

  if (!confirmar) return;

  localStorage.setItem(LOJA_OVERRIDE_KEY, novoStatus ? "aberta" : "fechada");
  carregarStatusLoja();
}

function removerOverrideLoja() {
  localStorage.removeItem(LOJA_OVERRIDE_KEY);
  carregarStatusLoja();
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
        {
          event: "*",
          schema: "public",
          table: "orders"
        },
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
  btnToggleLoja.addEventListener("click", alternarStatusLoja);
  btnToggleLoja.addEventListener("contextmenu", function (event) {
    event.preventDefault();
    const confirmar = confirm(
      "Remover o modo manual e voltar ao horário automático da loja?"
    );
    if (!confirmar) return;
    removerOverrideLoja();
  });
}

if (btnSair) btnSair.addEventListener("click", sairDoPainel);

if (buscaPedido) buscaPedido.addEventListener("input", renderizarQuadro);
if (filtroStatus) filtroStatus.addEventListener("change", renderizarQuadro);
if (filtroTipo) filtroTipo.addEventListener("change", renderizarQuadro);
if (ordenacao) ordenacao.addEventListener("change", renderizarQuadro);

window.addEventListener("storage", () => {
  carregarPedidos();
  carregarStatusLoja();
});

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
window.copiarPedido = copiarPedido;

esconderBotaoApagarTudo();
carregarStatusLoja();
carregarPedidos();
iniciarRealtimeSupabase();
atualizarRelogio();

setInterval(atualizarRelogio, 1000);
setInterval(atualizarContadoresTempo, 30000);
setInterval(() => {
  carregarPedidos();
  carregarStatusLoja();
}, 5000);
