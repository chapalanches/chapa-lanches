let pedidos = [];
let ultimaQuantidadePedidos = 0;

const STORAGE_KEYS = ["pedidos", "chapa_pedidos", "pedidos_chapa"];
const LOJA_STATUS_KEY = "chapa_loja_aberta";
const LOJA_OVERRIDE_KEY = "chapa_loja_override";
const LOGIN_STORAGE_KEY = "chapa_admin_logado";

function byId(id) {
  return document.getElementById(id);
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
    const partes = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
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

function normalizarPedido(pedido, index) {
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const dataObj = converterDataSegura(pedido.data || pedido.criadoEm || pedido.createdAt);

  const totalCalculadoItens = itens.reduce((acc, item) => {
    const quantidade = Number(item.quantidade || 1);
    const preco = Number(item.preco || item.valor || 0);
    return acc + (quantidade * preco);
  }, 0);

  let subtotal = Number(pedido.subtotal || 0);
  if (!subtotal && totalCalculadoItens) subtotal = totalCalculadoItens;

  const taxaEntrega = Number(pedido.taxaEntrega || pedido.taxa || 0);
  let total = Number(pedido.total || 0);
  if (!total) total = subtotal + taxaEntrega;

  const id = pedido.id || gerarId(index);

  return {
    uid: gerarUidPedido({ id }, index, dataObj),
    id,
    cliente: pedido.cliente || pedido.nome || "Cliente não informado",
    telefone: pedido.telefone || pedido.whatsapp || "",
    entrega: pedido.entrega || pedido.tipoEntrega || pedido.tipo || "Não informado",
    tipoEntrega: normalizarTipoEntrega(pedido.entrega || pedido.tipoEntrega || pedido.tipo || ""),
    endereco: pedido.endereco || "",
    numero: pedido.numero || "",
    bairro: pedido.bairro || "",
    complemento: pedido.complemento || "",
    pagamento: pedido.pagamento || pedido.formaPagamento || "Não informado",
    troco: pedido.troco || "",
    observacao: pedido.observacao || pedido.observacoes || "",
    subtotal,
    taxaEntrega,
    total,
    status: String(pedido.status || "pendente").toLowerCase(),
    dataOriginal: pedido.data || pedido.criadoEm || pedido.createdAt || formatarDataBR(dataObj),
    dataObj,
    dataTexto: formatarDataBR(dataObj),
    itens: itens.map(item => ({
      nome: item.nome || item.titulo || "Item",
      quantidade: Number(item.quantidade || 1),
      preco: Number(item.preco || item.valor || 0),
      observacao: item.observacao || ""
    }))
  };
}

function carregarPedidos() {
  const dados = obterPedidosStorage();
  const pedidosBrutos = Array.isArray(dados.pedidos) ? dados.pedidos : [];

  const quantidadeAnterior = ultimaQuantidadePedidos;
  pedidos = pedidosBrutos.map((pedido, index) => normalizarPedido(pedido, index));

  if (quantidadeAnterior > 0 && pedidos.length > quantidadeAnterior) {
    tocarNotificacaoNovoPedido();
  }

  ultimaQuantidadePedidos = pedidos.length;
  atualizarResumo();
  renderizarQuadro();
}

function atualizarResumo() {
  const hoje = new Date();

  const pedidosHojeLista = pedidos.filter(p => p.dataObj.toDateString() === hoje.toDateString());

  const faturamento = pedidosHojeLista.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0);
  const ticket = pedidosHojeLista.length ? (faturamento / pedidosHojeLista.length) : 0;
  const delivery = pedidos.filter(p => p.tipoEntrega === "delivery").length;
  const retirada = pedidos.filter(p => p.tipoEntrega === "retirada").length;
  const pendentes = pedidos.filter(p => p.status === "pendente").length;
  const preparo = pedidos.filter(p => p.status === "em preparo").length;
  const entrega = pedidos.filter(p => p.status === "em entrega").length;
  const finalizados = pedidos.filter(p => p.status === "finalizado").length;

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

  const filtrados = pedidos.filter(pedido => {
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

  return pedido.itens.map(item => `
    <div class="item-row">
      <div class="item-row-top">
        <span>${item.quantidade}x ${item.nome}</span>
        <span>${formatarMoeda(item.preco * item.quantidade)}</span>
      </div>
      <small>Unitário: ${formatarMoeda(item.preco)}</small>
      ${item.observacao ? `<small>Obs.: ${item.observacao}</small>` : ""}
    </div>
  `).join("");
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
  const indiceReal = pedidos.findIndex(p => p.uid === pedido.uid);
  const telefoneLimpo = String(pedido.telefone || "").replace(/\D/g, "");
  const novo = pedidoEhNovo(pedido);
  const atrasado = pedidoAtrasado(pedido);

  let extraClasses = "";
  if (novo) extraClasses += " new-order";
  if (atrasado) extraClasses += " delay-order";

  return `
    <article class="order-card${extraClasses}">
      <div class="order-top">
        <div class="order-header-row">
          <div>
            <div class="order-id">${pedido.id}</div>
            <div class="order-customer">${pedido.cliente}</div>
          </div>
        </div>

        <div class="order-meta">
          <span class="badge badge-time">${tempoDecorridoTexto(pedido.dataObj)}</span>
          ${novo ? `<span class="badge badge-new">Novo pedido</span>` : ""}
          ${atrasado ? `<span class="badge badge-delay">Atenção</span>` : ""}
        </div>
      </div>

      <div class="order-body">
        <div class="mini-block">
          <h4>Informações</h4>
          <div class="line"><strong>Hora:</strong> ${formatarHora(pedido.dataObj)}</div>
          <div class="line"><strong>Entrega:</strong> ${pedido.entrega}</div>
          <div class="line"><strong>Pagamento:</strong> ${pedido.pagamento}</div>
          <div class="line"><strong>Telefone:</strong> ${pedido.telefone || "Não informado"}</div>
          ${pedido.troco ? `<div class="line"><strong>Troco:</strong> ${pedido.troco}</div>` : ""}
        </div>

        <div class="mini-block">
          <h4>Endereço</h4>
          <div class="line"><strong>Rua:</strong> ${pedido.endereco || "Não informado"}</div>
          <div class="line"><strong>Número:</strong> ${pedido.numero || "-"}</div>
          <div class="line"><strong>Bairro:</strong> ${pedido.bairro || "-"}</div>
          <div class="line"><strong>Comp.:</strong> ${pedido.complemento || "-"}</div>
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
          <div class="line"><strong>Obs.:</strong> ${pedido.observacao || "-"}</div>
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
          ${telefoneLimpo ? `<button class="btn btn-green btn-small" onclick="abrirWhatsapp('${telefoneLimpo}')">WhatsApp</button>` : `<button class="btn btn-dark btn-small" disabled>Sem WhatsApp</button>`}
          <button class="btn btn-dark btn-small" onclick="imprimirPedido('${pedido.uid}')">Imprimir</button>
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

  const pendentes = filtrados.filter(p => p.status === "pendente");
  const preparo = filtrados.filter(p => p.status === "em preparo");
  const entrega = filtrados.filter(p => p.status === "em entrega");
  const finalizados = filtrados.filter(p => p.status === "finalizado");

  renderizarColuna("colPendente", pendentes);
  renderizarColuna("colPreparo", preparo);
  renderizarColuna("colEntrega", entrega);
  renderizarColuna("colFinalizado", finalizados);
}

function alterarStatus(indice, novoStatus) {
  if (indice < 0 || indice >= pedidos.length) return;

  pedidos[indice].status = novoStatus;
  salvarPedidosStorage();
  atualizarResumo();
  renderizarQuadro();
}

function excluirPedido(indice) {
  if (indice < 0 || indice >= pedidos.length) return;

  const confirmar = confirm("Deseja realmente excluir este pedido?");
  if (!confirmar) return;

  pedidos.splice(indice, 1);
  salvarPedidosStorage();
  atualizarResumo();
  renderizarQuadro();
}

function limparTodosPedidos() {
  if (!pedidos.length) {
    alert("Não há pedidos para apagar.");
    return;
  }

  const confirmar = confirm("Tem certeza que deseja apagar TODOS os pedidos?");
  if (!confirmar) return;

  pedidos = [];
  salvarPedidosStorage();
  atualizarResumo();
  renderizarQuadro();
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
  return pedidos.find(p => p.uid === uidPedido);
}

function imprimirPedido(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const janela = window.open("", "_blank", "width=900,height=700");
  if (!janela) return;

  janela.document.write(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Impressão - ${pedido.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #000; }
          h1 { margin-bottom: 10px; }
          h2 { margin-top: 24px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
          p { margin: 6px 0; }
          .item { border-bottom: 1px dashed #ccc; padding: 8px 0; }
          .total { font-size: 20px; font-weight: bold; margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>Chapa Lanches</h1>
        <p><strong>Pedido:</strong> ${pedido.id}</p>
        <p><strong>Cliente:</strong> ${pedido.cliente}</p>
        <p><strong>Telefone:</strong> ${pedido.telefone || "-"}</p>
        <p><strong>Hora:</strong> ${pedido.dataTexto}</p>
        <p><strong>Entrega:</strong> ${pedido.entrega}</p>
        <p><strong>Pagamento:</strong> ${pedido.pagamento}</p>
        <p><strong>Troco:</strong> ${pedido.troco || "-"}</p>

        <h2>Endereço</h2>
        <p><strong>Rua:</strong> ${pedido.endereco || "-"}</p>
        <p><strong>Número:</strong> ${pedido.numero || "-"}</p>
        <p><strong>Bairro:</strong> ${pedido.bairro || "-"}</p>
        <p><strong>Complemento:</strong> ${pedido.complemento || "-"}</p>

        <h2>Itens</h2>
        ${pedido.itens.map(item => `
          <div class="item">
            <p><strong>${item.quantidade}x ${item.nome}</strong></p>
            <p>Unitário: ${formatarMoeda(item.preco)}</p>
            <p>Total item: ${formatarMoeda(item.preco * item.quantidade)}</p>
            ${item.observacao ? `<p>Obs.: ${item.observacao}</p>` : ""}
          </div>
        `).join("")}

        <h2>Resumo</h2>
        <p><strong>Subtotal:</strong> ${formatarMoeda(pedido.subtotal)}</p>
        <p><strong>Taxa:</strong> ${formatarMoeda(pedido.taxaEntrega)}</p>
        <p class="total">Total: ${formatarMoeda(pedido.total)}</p>

        <h2>Observação</h2>
        <p>${pedido.observacao || "-"}</p>

        <script>
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
    </html>
  `);

  janela.document.close();
}

function copiarPedido(uidPedido) {
  const pedido = buscarPedidoPorUid(uidPedido);
  if (!pedido) return;

  const texto = `
Pedido ${pedido.id}
Cliente: ${pedido.cliente}
Telefone: ${pedido.telefone || "-"}
Entrega: ${pedido.entrega}
Endereço: ${pedido.endereco || "-"}, ${pedido.numero || "-"} - ${pedido.bairro || "-"} ${pedido.complemento ? "- " + pedido.complemento : ""}
Pagamento: ${pedido.pagamento}
Troco: ${pedido.troco || "-"}
Itens:
${pedido.itens.map(item => `- ${item.quantidade}x ${item.nome} (${formatarMoeda(item.preco * item.quantidade)})${item.observacao ? " | Obs.: " + item.observacao : ""}`).join("\n")}
Subtotal: ${formatarMoeda(pedido.subtotal)}
Taxa: ${formatarMoeda(pedido.taxaEntrega)}
Total: ${formatarMoeda(pedido.total)}
Observação: ${pedido.observacao || "-"}
  `.trim();

  if (!navigator.clipboard) {
    alert("Seu navegador não permite cópia automática.");
    return;
  }

  navigator.clipboard.writeText(texto)
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

const btnAtualizar = byId("btnAtualizar");
const btnExportar = byId("btnExportar");
const btnLimparTudo = byId("btnLimparTudo");
const btnToggleLoja = byId("btnToggleLoja");
const btnSair = byId("btnSair");
const buscaPedido = byId("buscaPedido");
const filtroStatus = byId("filtroStatus");
const filtroTipo = byId("filtroTipo");
const ordenacao = byId("ordenacao");

if (btnAtualizar) btnAtualizar.addEventListener("click", carregarPedidos);
if (btnExportar) btnExportar.addEventListener("click", exportarPedidos);
if (btnLimparTudo) btnLimparTudo.addEventListener("click", limparTodosPedidos);
if (btnToggleLoja) {
  btnToggleLoja.addEventListener("click", alternarStatusLoja);
  btnToggleLoja.addEventListener("contextmenu", function (event) {
    event.preventDefault();
    const confirmar = confirm("Remover o modo manual e voltar ao horário automático da loja?");
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

carregarStatusLoja();
carregarPedidos();
atualizarRelogio();

setInterval(atualizarRelogio, 1000);
setInterval(() => {
  carregarPedidos();
  carregarStatusLoja();
}, 5000);
