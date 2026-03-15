let pedidos = [];

function obterPedidosStorage() {
  const chaves = ["pedidos", "chapa_pedidos", "pedidos_chapa"];

  for (const chave of chaves) {
    const dados = localStorage.getItem(chave);
    if (dados) {
      try {
        const lista = JSON.parse(dados);
        if (Array.isArray(lista)) {
          return { chave, pedidos: lista };
        }
      } catch (erro) {
        console.error("Erro ao ler pedidos do storage:", chave, erro);
      }
    }
  }

  return { chave: "pedidos", pedidos: [] };
}

function salvarPedidosStorage() {
  const info = obterPedidosStorage();
  localStorage.setItem(info.chave || "pedidos", JSON.stringify(pedidos));
}

function normalizarPedido(pedido, index) {
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];

  return {
    id: pedido.id || ("PED" + String(index + 1).padStart(4, "0")),
    cliente: pedido.cliente || pedido.nome || "Cliente não informado",
    telefone: pedido.telefone || pedido.whatsapp || "",
    entrega: pedido.entrega || pedido.tipoEntrega || pedido.tipo || "Não informado",
    endereco: pedido.endereco || "",
    numero: pedido.numero || "",
    bairro: pedido.bairro || "",
    complemento: pedido.complemento || "",
    pagamento: pedido.pagamento || pedido.formaPagamento || "Não informado",
    troco: pedido.troco || "",
    observacao: pedido.observacao || pedido.observacoes || "",
    subtotal: Number(pedido.subtotal || 0),
    taxaEntrega: Number(pedido.taxaEntrega || pedido.taxa || 0),
    total: Number(pedido.total || 0),
    data: pedido.data || pedido.criadoEm || new Date().toLocaleString("pt-BR"),
    status: (pedido.status || "pendente").toLowerCase(),
    itens: itens.map(item => ({
      nome: item.nome || item.titulo || "Item",
      quantidade: Number(item.quantidade || 1),
      preco: Number(item.preco || item.valor || 0),
      observacao: item.observacao || ""
    }))
  };
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function classeStatus(status) {
  if (status === "pendente") return "status status-pendente";
  if (status === "em preparo") return "status status-preparo";
  if (status === "em entrega") return "status status-entrega";
  if (status === "finalizado") return "status status-finalizado";
  return "status status-pendente";
}

function textoStatus(status) {
  if (status === "pendente") return "Pendente";
  if (status === "em preparo") return "Em preparo";
  if (status === "em entrega") return "Em entrega";
  if (status === "finalizado") return "Finalizado";
  return "Pendente";
}

function atualizarIndicadores() {
  document.getElementById("totalPedidos").textContent = pedidos.length;
  document.getElementById("totalPendentes").textContent = pedidos.filter(p => p.status === "pendente").length;
  document.getElementById("totalPreparo").textContent = pedidos.filter(p => p.status === "em preparo").length;
  document.getElementById("totalEntrega").textContent = pedidos.filter(p => p.status === "em entrega").length;
  document.getElementById("totalFinalizados").textContent = pedidos.filter(p => p.status === "finalizado").length;
}

function carregarPedidos() {
  const dados = obterPedidosStorage();
  pedidos = dados.pedidos.map((pedido, index) => normalizarPedido(pedido, index));
  atualizarIndicadores();
  renderizarPedidos();
}

function renderizarPedidos() {
  const lista = document.getElementById("listaPedidos");
  const busca = document.getElementById("buscaPedido").value.toLowerCase().trim();
  const filtroStatus = document.getElementById("filtroStatus").value;

  let filtrados = pedidos.filter(pedido => {
    const textoBusca = `
      ${pedido.id}
      ${pedido.cliente}
      ${pedido.telefone}
      ${pedido.entrega}
      ${pedido.endereco}
      ${pedido.numero}
      ${pedido.bairro}
      ${pedido.complemento}
      ${pedido.pagamento}
      ${pedido.observacao}
    `.toLowerCase();

    const bateBusca = !busca || textoBusca.includes(busca);
    const bateStatus = !filtroStatus || pedido.status === filtroStatus;

    return bateBusca && bateStatus;
  });

  filtrados = filtrados.slice().reverse();

  if (!filtrados.length) {
    lista.innerHTML = `
      <div class="vazio">
        <h2>Nenhum pedido encontrado</h2>
        <p>Assim que novos pedidos forem salvos, eles aparecerão aqui.</p>
      </div>
    `;
    return;
  }

  lista.innerHTML = filtrados.map(pedido => {
    const indiceReal = pedidos.findIndex(p => p.id === pedido.id);

    const itensHtml = pedido.itens.length
      ? pedido.itens.map(item => `
          <div class="item-pedido">
            <div class="item-topo">
              <span>${item.quantidade}x ${item.nome}</span>
              <span>${formatarMoeda(item.preco * item.quantidade)}</span>
            </div>
            <small>Preço unitário: ${formatarMoeda(item.preco)}</small>
            ${item.observacao ? `<small>Obs.: ${item.observacao}</small>` : ``}
          </div>
        `).join("")
      : `<div class="item-pedido"><small>Nenhum item detalhado neste pedido.</small></div>`;

    const telefoneLimpo = (pedido.telefone || "").replace(/\D/g, "");
    const botaoWhatsapp = telefoneLimpo
      ? `<button class="btn btn-green" onclick="abrirWhatsapp('${telefoneLimpo}')">WhatsApp</button>`
      : "";

    return `
      <article class="pedido-card">
        <div class="pedido-topo">
          <div>
            <h3>Pedido ${pedido.id}</h3>
            <small>Recebido em: ${pedido.data}</small>
          </div>
          <div class="${classeStatus(pedido.status)}">${textoStatus(pedido.status)}</div>
        </div>

        <div class="pedido-body">
          <div class="pedido-bloco">
            <h4>Cliente</h4>
            <div class="info-line"><strong>Nome:</strong> <span>${pedido.cliente}</span></div>
            <div class="info-line"><strong>Telefone:</strong> <span>${pedido.telefone || "Não informado"}</span></div>
            <div class="info-line"><strong>Entrega:</strong> <span>${pedido.entrega}</span></div>
            <div class="info-line"><strong>Pagamento:</strong> <span>${pedido.pagamento}</span></div>
            ${pedido.troco ? `<div class="info-line"><strong>Troco para:</strong> <span>${pedido.troco}</span></div>` : ""}
          </div>

          <div class="pedido-bloco">
            <h4>Endereço</h4>
            <div class="info-line"><strong>Endereço:</strong> <span>${pedido.endereco || "Não informado"}</span></div>
            <div class="info-line"><strong>Número:</strong> <span>${pedido.numero || "-"}</span></div>
            <div class="info-line"><strong>Bairro:</strong> <span>${pedido.bairro || "-"}</span></div>
            <div class="info-line"><strong>Complemento:</strong> <span>${pedido.complemento || "-"}</span></div>
          </div>

          <div class="pedido-bloco">
            <h4>Itens do pedido</h4>
            <div class="itens-lista">
              ${itensHtml}
            </div>
          </div>

          <div class="pedido-bloco">
            <h4>Resumo</h4>
            <div class="info-line"><strong>Subtotal:</strong> <span>${formatarMoeda(pedido.subtotal)}</span></div>
            <div class="info-line"><strong>Taxa entrega:</strong> <span>${formatarMoeda(pedido.taxaEntrega)}</span></div>
            <div class="info-line"><strong>Total:</strong> <span>${formatarMoeda(pedido.total)}</span></div>
            <div class="info-line"><strong>Observação:</strong> <span>${pedido.observacao || "-"}</span></div>
          </div>
        </div>

        <div class="pedido-acoes">
          <select onchange="alterarStatus(${indiceReal}, this.value)">
            <option value="pendente" ${pedido.status === "pendente" ? "selected" : ""}>Pendente</option>
            <option value="em preparo" ${pedido.status === "em preparo" ? "selected" : ""}>Em preparo</option>
            <option value="em entrega" ${pedido.status === "em entrega" ? "selected" : ""}>Em entrega</option>
            <option value="finalizado" ${pedido.status === "finalizado" ? "selected" : ""}>Finalizado</option>
          </select>

          ${botaoWhatsapp}

          <button class="btn btn-red" onclick="excluirPedido(${indiceReal})">Excluir</button>
        </div>
      </article>
    `;
  }).join("");
}

function alterarStatus(indice, novoStatus) {
  if (indice < 0 || indice >= pedidos.length) return;

  pedidos[indice].status = novoStatus;
  salvarPedidosStorage();
  atualizarIndicadores();
  renderizarPedidos();
}

function excluirPedido(indice) {
  if (indice < 0 || indice >= pedidos.length) return;

  const confirmar = confirm("Deseja realmente excluir este pedido?");
  if (!confirmar) return;

  pedidos.splice(indice, 1);
  salvarPedidosStorage();
  atualizarIndicadores();
  renderizarPedidos();
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
  atualizarIndicadores();
  renderizarPedidos();
}

function exportarPedidos() {
  const blob = new Blob([JSON.stringify(pedidos, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pedidos-chapa-lanches.json";
  a.click();
  URL.revokeObjectURL(url);
}

function abrirWhatsapp(telefone) {
  window.open(`https://wa.me/${telefone}`, "_blank");
}

document.getElementById("btnAtualizar").addEventListener("click", carregarPedidos);
document.getElementById("btnExportar").addEventListener("click", exportarPedidos);
document.getElementById("btnLimparTudo").addEventListener("click", limparTodosPedidos);
document.getElementById("buscaPedido").addEventListener("input", renderizarPedidos);
document.getElementById("filtroStatus").addEventListener("change", renderizarPedidos);

window.addEventListener("storage", carregarPedidos);

carregarPedidos();
setInterval(carregarPedidos, 5000);
