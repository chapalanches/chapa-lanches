const numeroWhatsapp = (window.APP_CONFIG && window.APP_CONFIG.whatsappNumber) || '5515996179172';
const nomeLoja = (window.APP_CONFIG && window.APP_CONFIG.storeName) || 'Chapa Lanches';
const ENDERECO_LOJA_PADRAO = 'Avenida Doutor Artur Bernardes, 235, Sorocaba, SP, 18081-000';

const REGRAS_ENTREGA_PADRAO = [
  { km_min: 0, km_max: 3, fee: 4, active: true },
  { km_min: 3.01, km_max: 4, fee: 5, active: true },
  { km_min: 4.01, km_max: 5, fee: 6, active: true },
  { km_min: 5.01, km_max: 6, fee: 7, active: true },
  { km_min: 6.01, km_max: 7, fee: 8, active: true },
  { km_min: 7.01, km_max: 8, fee: 9, active: true },
  { km_min: 8.01, km_max: 9, fee: 10, active: true },
  { km_min: 9.01, km_max: 10, fee: 11, active: true }
];

let supabaseClient = null;

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

let carrinho = [];
let taxaEntrega = 0;
let distanciaEntregaKm = null;
let tempoEntregaTexto = null;
let regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
let configuracaoLoja = null;
let timeoutCalculoEntrega = null;

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function somenteNumeros(texto) {
  return (texto || '').replace(/\D/g, '');
}

function formatarTipoEntregaTexto(tipo) {
  return tipo === 'delivery' ? 'Delivery' : 'Retirada no local';
}

function aplicarMascaraCep() {
  const input = document.getElementById('cepEntrega');
  if (!input) return;

  input.addEventListener('input', function () {
    let valor = somenteNumeros(input.value).slice(0, 8);

    if (valor.length > 5) {
      valor = valor.slice(0, 5) + '-' + valor.slice(5);
    }

    input.value = valor;
    agendarCalculoEntrega();
  });

  input.addEventListener('blur', buscarCepEntrega);
}

function aplicarEventosEntrega() {
  const ids = [
    'ruaEntrega',
    'numeroEntrega',
    'bairroEntrega',
    'cidadeEntrega',
    'complementoEntrega'
  ];

  ids.forEach(id => {
    const campo = document.getElementById(id);
    if (!campo) return;

    campo.addEventListener('input', agendarCalculoEntrega);
    campo.addEventListener('change', agendarCalculoEntrega);
    campo.addEventListener('blur', agendarCalculoEntrega);
  });
}

function agendarCalculoEntrega() {
  clearTimeout(timeoutCalculoEntrega);
  timeoutCalculoEntrega = setTimeout(() => {
    calcularEntregaAutomaticamente();
  }, 700);
}

function montarEnderecoCompletoCliente() {
  const rua = document.getElementById('ruaEntrega').value.trim();
  const numero = document.getElementById('numeroEntrega').value.trim();
  const cidade = document.getElementById('cidadeEntrega').value.trim() || 'Sorocaba';
  const cep = document.getElementById('cepEntrega').value.trim();

  return `${rua}, ${numero}, ${cidade}, SP, ${cep}`;
}

function enderecoClienteTextoHumano() {
  const rua = document.getElementById('ruaEntrega').value.trim();
  const numero = document.getElementById('numeroEntrega').value.trim();
  const bairro = document.getElementById('bairroEntrega').value.trim();
  const cidade = document.getElementById('cidadeEntrega').value.trim() || 'Sorocaba';
  const cep = document.getElementById('cepEntrega').value.trim();
  const complemento = document.getElementById('complementoEntrega').value.trim();

  const partes = [];

  if (rua) partes.push(rua);
  if (numero) partes.push(numero);
  if (bairro) partes.push(bairro);
  if (cidade) partes.push(cidade);
  if (cep) partes.push(`CEP ${cep}`);
  if (complemento) partes.push(complemento);

  return partes.join(', ');
}

async function buscarCepEntrega() {
  const campoCep = document.getElementById('cepEntrega');
  const avisoEntrega = document.getElementById('avisoEntrega');

  if (!campoCep || !avisoEntrega) return;

  const cep = somenteNumeros(campoCep.value);

  if (cep.length !== 8) return;

  try {
    avisoEntrega.innerText = 'Consultando CEP...';

    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      avisoEntrega.innerText = 'CEP não encontrado. Confira o número digitado.';
      return;
    }

    if (!document.getElementById('ruaEntrega').value.trim()) {
      document.getElementById('ruaEntrega').value = dados.logradouro || '';
    }

    if (!document.getElementById('bairroEntrega').value.trim()) {
      document.getElementById('bairroEntrega').value = dados.bairro || '';
    }

    if (!document.getElementById('cidadeEntrega').value.trim()) {
      document.getElementById('cidadeEntrega').value = dados.localidade || 'Sorocaba';
    }

    avisoEntrega.innerText = 'CEP localizado. Informe o número para calcular a taxa.';
    await calcularEntregaAutomaticamente();
  } catch (erro) {
    console.error(erro);
    avisoEntrega.innerText = 'Não foi possível consultar o CEP agora.';
  }
}

function atualizarContadores() {
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const cartCount = document.getElementById('cartCount');
  if (cartCount) {
    cartCount.innerText = totalItens;
  }
}

function adicionarAoCarrinho(nome, preco) {
  const itemExistente = carrinho.find(item => item.nome === nome);

  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    carrinho.push({
      nome,
      preco,
      quantidade: 1
    });
  }

  atualizarContadores();
}

function aumentarQuantidade(index) {
  carrinho[index].quantidade += 1;
  renderizarCarrinho();
}

function diminuirQuantidade(index) {
  carrinho[index].quantidade -= 1;

  if (carrinho[index].quantidade <= 0) {
    carrinho.splice(index, 1);
  }

  renderizarCarrinho();
}

function removerItem(index) {
  carrinho.splice(index, 1);
  renderizarCarrinho();
}

function calcularSubtotal() {
  return carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
}

function calcularTotal() {
  return calcularSubtotal() + taxaEntrega;
}

function lojaAbertaAgora() {
  const agora = new Date();
  const dia = agora.getDay();

  if (dia !== 0 && dia !== 3 && dia !== 4 && dia !== 5 && dia !== 6) {
    return false;
  }

  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const abre = 19 * 60;
  const fecha = 22 * 60 + 30;

  return minutosAgora >= abre && minutosAgora < fecha;
}

function atualizarStatusLoja() {
  const statusLoja = document.getElementById('statusLoja');
  const btnFinalizar = document.getElementById('btnFinalizar');
  const aberta = lojaAbertaAgora();

  if (statusLoja) {
    if (aberta) {
      statusLoja.classList.remove('fechado');
      statusLoja.classList.add('aberto');
      statusLoja.innerText = '🟢 Aberto agora';
    } else {
      statusLoja.classList.remove('aberto');
      statusLoja.classList.add('fechado');
      statusLoja.innerText = '🔴 Fechado no momento';
    }
  }

  if (btnFinalizar) {
    btnFinalizar.disabled = !aberta;
  }
}

function atualizarEntrega() {
  const tipoEntrega = document.getElementById('tipoEntrega').value;
  const camposEntrega = document.getElementById('camposEntrega');
  const avisoEntrega = document.getElementById('avisoEntrega');

  if (tipoEntrega === 'delivery') {
    if (camposEntrega) {
      camposEntrega.style.display = 'grid';
    }

    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim();

    if (!rua || !numero || !bairro || !cidade) {
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      if (avisoEntrega) {
        avisoEntrega.innerText = 'Preencha CEP, rua, número, bairro e cidade para calcular a entrega.';
      }
    } else {
      agendarCalculoEntrega();
    }
  } else {
    if (camposEntrega) {
      camposEntrega.style.display = 'none';
    }

    document.getElementById('cepEntrega').value = '';
    document.getElementById('ruaEntrega').value = '';
    document.getElementById('numeroEntrega').value = '';
    document.getElementById('bairroEntrega').value = '';
    document.getElementById('cidadeEntrega').value = 'Sorocaba';
    document.getElementById('complementoEntrega').value = '';
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }
  }

  renderizarCarrinho();
}

function renderizarCarrinho() {
  const lista = document.getElementById('listaCarrinho');
  const subtotal = calcularSubtotal();
  const total = calcularTotal();

  if (lista) {
    if (carrinho.length === 0) {
      lista.innerHTML = '<div class="carrinho-vazio">Seu carrinho está vazio.</div>';
    } else {
      lista.innerHTML = `
        <div class="lista-carrinho">
          ${carrinho.map((item, index) => `
            <div class="item-carrinho">
              <div>
                <strong>${item.nome}</strong>
                <small>${formatarPreco(item.preco)} cada</small>
              </div>
              <div class="acoes-carrinho">
                <div class="qtd-box">
                  <button class="qtd-btn" onclick="diminuirQuantidade(${index})">-</button>
                  <strong>${item.quantidade}</strong>
                  <button class="qtd-btn" onclick="aumentarQuantidade(${index})">+</button>
                </div>
                <strong>${formatarPreco(item.preco * item.quantidade)}</strong>
                <button class="btn-remover" onclick="removerItem(${index})">Remover</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  const resumoItens = document.getElementById('resumoItens');
  const resumoSubtotal = document.getElementById('resumoSubtotal');
  const resumoTaxaEntrega = document.getElementById('resumoTaxaEntrega');
  const resumoTotal = document.getElementById('resumoTotal');

  if (resumoItens) {
    resumoItens.innerText = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  }

  if (resumoSubtotal) {
    resumoSubtotal.innerText = formatarPreco(subtotal);
  }

  if (resumoTaxaEntrega) {
    resumoTaxaEntrega.innerText = formatarPreco(taxaEntrega);
  }

  if (resumoTotal) {
    resumoTotal.innerText = formatarPreco(total);
  }

  atualizarContadores();
  atualizarStatusLoja();
}

function abrirCarrinho() {
  renderizarCarrinho();
  const modal = document.getElementById('modalCarrinho');
  if (modal) {
    modal.classList.add('ativo');
  }
}

function fecharCarrinho() {
  const modal = document.getElementById('modalCarrinho');
  if (modal) {
    modal.classList.remove('ativo');
  }
}

function limparCarrinho() {
  carrinho = [];
  taxaEntrega = 0;
  distanciaEntregaKm = null;
  tempoEntregaTexto = null;
  document.getElementById('nomeCliente').value = '';
  document.getElementById('tipoEntrega').value = 'retirada';
  document.getElementById('cepEntrega').value = '';
  document.getElementById('ruaEntrega').value = '';
  document.getElementById('numeroEntrega').value = '';
  document.getElementById('bairroEntrega').value = '';
  document.getElementById('cidadeEntrega').value = 'Sorocaba';
  document.getElementById('complementoEntrega').value = '';
  document.getElementById('formaPagamento').value = '';
  document.getElementById('observacoes').value = '';
  atualizarEntrega();
  renderizarCarrinho();
}

async function carregarRegrasEntrega() {
  if (!supabaseClient) {
    regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('delivery_rules')
      .select('*')
      .eq('active', true)
      .order('km_min', { ascending: true });

    if (error) {
      console.error('Erro ao carregar regras de entrega:', error);
      regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
      return;
    }

    regrasEntrega = data && data.length > 0 ? data : [...REGRAS_ENTREGA_PADRAO];
  } catch (erro) {
    console.error('Falha ao carregar regras:', erro);
    regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
  }
}

async function carregarConfiguracaoLoja() {
  if (!supabaseClient) {
    configuracaoLoja = {
      store_address: ENDERECO_LOJA_PADRAO,
      store_lat: null,
      store_lng: null
    };
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('store_settings')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Erro ao carregar configuração da loja:', error);
      configuracaoLoja = {
        store_address: ENDERECO_LOJA_PADRAO,
        store_lat: null,
        store_lng: null
      };
      return;
    }

    configuracaoLoja = (data && data.length > 0)
      ? data[0]
      : {
          store_address: ENDERECO_LOJA_PADRAO,
          store_lat: null,
          store_lng: null
        };
  } catch (erro) {
    console.error('Falha ao carregar configuração:', erro);
    configuracaoLoja = {
      store_address: ENDERECO_LOJA_PADRAO,
      store_lat: null,
      store_lng: null
    };
  }
}

async function geocodificarEnderecoOpenStreetMap(endereco) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;

  const resposta = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!resposta.ok) {
    throw new Error('Erro ao consultar geocodificação no OpenStreetMap.');
  }

  const dados = await resposta.json();
  console.log('Geocodificando:', endereco, dados);

  if (!Array.isArray(dados) || dados.length === 0) {
    return null;
  }

  return {
    lat: Number(dados[0].lat),
    lng: Number(dados[0].lon),
    display_name: dados[0].display_name || endereco
  };
}

async function geocodificarEnderecoProfissional(endereco) {
  const tentativas = [
    endereco,
    endereco.replace(/,\s*\d+\s*,/g, ', '),
    endereco.replace(/,\s*\d+\s*,/g, ', ').replace(/,\s*\d{5}-?\d{3}/g, ''),
    endereco.replace(/,\s*\d{5}-?\d{3}/g, ''),
    endereco.replace(/,\s*Brasil/gi, ''),
    endereco.replace(/,\s*\d+\s*,/g, ', ').replace(/,\s*Brasil/gi, '').replace(/,\s*\d{5}-?\d{3}/g, '')
  ];

  for (const tentativa of tentativas) {
    const texto = tentativa
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*$/, '')
      .trim();

    if (!texto) continue;

    try {
      const resultado = await geocodificarEnderecoOpenStreetMap(texto);
      if (resultado) return resultado;
    } catch (erro) {
      console.warn('Falha ao geocodificar:', texto, erro.message);
    }
  }

  return null;
}

async function calcularRotaRealOSRM(origem, destino) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=false&steps=false`;

  const resposta = await fetch(url);

  if (!resposta.ok) {
    throw new Error('Erro ao calcular rota no OSRM.');
  }

  const dados = await resposta.json();

  if (!dados || dados.code !== 'Ok' || !dados.routes || !dados.routes.length) {
    throw new Error('Não foi possível calcular a rota.');
  }

  const rota = dados.routes[0];

  return {
    distanciaMetros: rota.distance,
    distanciaTexto: `${(rota.distance / 1000).toFixed(2)} km`,
    duracaoSegundos: rota.duration,
    duracaoTexto: formatarDuracao(rota.duration)
  };
}

function formatarDuracao(segundos) {
  const totalMin = Math.round(Number(segundos || 0) / 60);

  if (totalMin < 60) {
    return `${totalMin} min`;
  }

  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;

  if (minutos === 0) {
    return `${horas}h`;
  }

  return `${horas}h ${minutos}min`;
}

function descobrirTaxaPorDistancia(distanciaKm) {
  if (!Number.isFinite(distanciaKm) || distanciaKm <= 0) {
    return 0;
  }

  if (regrasEntrega && regrasEntrega.length > 0) {
    const regra = regrasEntrega.find(r => {
      const min = Number(r.km_min);
      const max = Number(r.km_max);
      return distanciaKm >= min && distanciaKm <= max;
    });

    if (regra) {
      return Number(regra.fee);
    }
  }

  if (distanciaKm <= 3) {
    return 4;
  }

  return 4 + Math.ceil(distanciaKm - 3);
}

async function calcularEntregaAutomaticamente() {
  const tipoEntrega = document.getElementById('tipoEntrega').value;
  const avisoEntrega = document.getElementById('avisoEntrega');

  if (tipoEntrega !== 'delivery') {
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;
    if (avisoEntrega) {
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }
    renderizarCarrinho();
    return;
  }

  const cep = document.getElementById('cepEntrega').value.trim();
  const rua = document.getElementById('ruaEntrega').value.trim();
  const numero = document.getElementById('numeroEntrega').value.trim();
  const bairro = document.getElementById('bairroEntrega').value.trim();
  const cidade = document.getElementById('cidadeEntrega').value.trim();

  if (!cep || !rua || !numero || !bairro || !cidade) {
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;
    if (avisoEntrega) {
      avisoEntrega.innerText = 'Preencha CEP, rua, número, bairro e cidade para calcular a entrega.';
    }
    renderizarCarrinho();
    return;
  }

  if (avisoEntrega) {
    avisoEntrega.innerText = 'Calculando rota real e taxa de entrega...';
  }

  try {
    const enderecoLoja = configuracaoLoja?.store_address || ENDERECO_LOJA_PADRAO;
    const enderecoCliente = montarEnderecoCompletoCliente();

    let coordenadaLoja = null;

    if (configuracaoLoja?.store_lat && configuracaoLoja?.store_lng) {
      coordenadaLoja = {
        lat: Number(configuracaoLoja.store_lat),
        lng: Number(configuracaoLoja.store_lng),
        display_name: enderecoLoja
      };
    } else {
      coordenadaLoja = await geocodificarEnderecoProfissional(enderecoLoja);
    }

    const coordenadaCliente = await geocodificarEnderecoProfissional(enderecoCliente);

    if (!coordenadaLoja || !coordenadaCliente) {
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      if (avisoEntrega) {
        avisoEntrega.innerText = 'Não foi possível localizar o endereço. Confira os dados digitados.';
      }
      renderizarCarrinho();
      return;
    }

    const rota = await calcularRotaRealOSRM(coordenadaLoja, coordenadaCliente);

    distanciaEntregaKm = Number((rota.distanciaMetros / 1000).toFixed(2));
    tempoEntregaTexto = rota.duracaoTexto || null;
    taxaEntrega = descobrirTaxaPorDistancia(distanciaEntregaKm);

    if (avisoEntrega) {
      avisoEntrega.innerText =
        `Distância real: ${distanciaEntregaKm.toFixed(2)} km | Tempo estimado: ${tempoEntregaTexto || '-'} | Taxa: ${formatarPreco(taxaEntrega)}`;
    }

    renderizarCarrinho();
  } catch (erro) {
    console.error('Erro ao calcular entrega:', erro);
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;
    if (avisoEntrega) {
      avisoEntrega.innerText = 'Erro ao calcular a entrega. Tente novamente em instantes.';
    }
    renderizarCarrinho();
  }
}

async function salvarPedidoNoBanco(payload) {
  if (!supabaseClient) {
    return { id: Date.now() };
  }

  const { data, error } = await supabaseClient
    .from('orders')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar pedido:', error);
    throw error;
  }

  return data;
}

async function finalizarPedido() {
  if (carrinho.length === 0) {
    alert('Seu carrinho está vazio.');
    return;
  }

  if (!lojaAbertaAgora()) {
    alert('A loja está fechada no momento.');
    return;
  }

  const nome = document.getElementById('nomeCliente').value.trim();
  const tipoEntrega = document.getElementById('tipoEntrega').value;
  const pagamento = document.getElementById('formaPagamento').value;
  const observacoes = document.getElementById('observacoes').value.trim();
  const avisoEntrega = document.getElementById('avisoEntrega');
  const btnFinalizar = document.getElementById('btnFinalizar');

  const endereco = enderecoClienteTextoHumano();

  if (!nome) {
    alert('Digite seu nome.');
    return;
  }

  if (tipoEntrega === 'delivery') {
    const cep = document.getElementById('cepEntrega').value.trim();
    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim();

    if (!cep || !rua || !numero || !bairro || !cidade) {
      alert('Preencha CEP, rua, número, bairro e cidade.');
      return;
    }

    if (distanciaEntregaKm === null) {
      await calcularEntregaAutomaticamente();
    }

    if (distanciaEntregaKm === null) {
      alert('Não foi possível calcular a entrega. Verifique o endereço.');
      return;
    }
  }

  const subtotal = calcularSubtotal();
  const total = calcularTotal();

  const payload = {
    customer_name: nome,
    customer_phone: '',
    order_type: tipoEntrega,
    customer_address: tipoEntrega === 'delivery' ? endereco : null,
    customer_neighborhood: tipoEntrega === 'delivery' ? document.getElementById('bairroEntrega').value.trim() : null,
    customer_city: tipoEntrega === 'delivery' ? document.getElementById('cidadeEntrega').value.trim() : 'Sorocaba',
    customer_notes: [
      pagamento ? `Pagamento: ${pagamento}` : '',
      observacoes ? `Observações: ${observacoes}` : '',
      tipoEntrega === 'delivery' && document.getElementById('complementoEntrega').value.trim()
        ? `Complemento: ${document.getElementById('complementoEntrega').value.trim()}`
        : '',
      tipoEntrega === 'delivery' && tempoEntregaTexto
        ? `Tempo estimado: ${tempoEntregaTexto}`
        : ''
    ].filter(Boolean).join(' | '),
    items: carrinho.map(item => ({
      nome: item.nome,
      preco: item.preco,
      quantidade: item.quantidade
    })),
    subtotal: subtotal,
    delivery_fee: taxaEntrega,
    total: total,
    delivery_distance_km: tipoEntrega === 'delivery' ? distanciaEntregaKm : null,
    status: 'novo'
  };

  try {
    if (btnFinalizar) {
      btnFinalizar.disabled = true;
      btnFinalizar.innerText = 'Salvando pedido...';
    }

    const pedidoSalvo = await salvarPedidoNoBanco(payload);
    const emojiPedido = String.fromCodePoint(0x1F354);

    let mensagem = `${emojiPedido} *Pedido - ${nomeLoja}*

*Pedido:* #${pedidoSalvo.id}
*Cliente:* ${nome}
*Tipo do pedido:* ${formatarTipoEntregaTexto(tipoEntrega)}`;

    if (tipoEntrega === 'delivery') {
      mensagem += `
*Endereço:* ${endereco}
*Distância real:* ${distanciaEntregaKm.toFixed(2)} km`;

      if (tempoEntregaTexto) {
        mensagem += `
*Tempo estimado:* ${tempoEntregaTexto}`;
      }
    }

    mensagem += `

*Itens do pedido:*`;

    carrinho.forEach(item => {
      mensagem += `
- ${item.quantidade}x ${item.nome} - ${formatarPreco(item.preco * item.quantidade)}`;
    });

    mensagem += `

*Subtotal:* ${formatarPreco(subtotal)}
*Taxa de entrega:* ${formatarPreco(taxaEntrega)}
*Total:* ${formatarPreco(total)}`;

    if (pagamento) {
      mensagem += `
*Pagamento:* ${pagamento}`;
    }

    if (observacoes) {
      mensagem += `
*Observações:* ${observacoes}`;
    }

    window.open(
      `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensagem)}`,
      '_blank'
    );

    carrinho = [];
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;
    document.getElementById('nomeCliente').value = '';
    document.getElementById('tipoEntrega').value = 'retirada';
    document.getElementById('cepEntrega').value = '';
    document.getElementById('ruaEntrega').value = '';
    document.getElementById('numeroEntrega').value = '';
    document.getElementById('bairroEntrega').value = '';
    document.getElementById('cidadeEntrega').value = 'Sorocaba';
    document.getElementById('complementoEntrega').value = '';
    document.getElementById('formaPagamento').value = '';
    document.getElementById('observacoes').value = '';

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }

    fecharCarrinho();
    renderizarCarrinho();

    alert('Pedido salvo com sucesso no painel!');
  } catch (erro) {
    alert('Erro ao salvar o pedido. Verifique a configuração do Supabase.');
    console.error(erro);
  } finally {
    if (btnFinalizar) {
      btnFinalizar.innerText = 'Finalizar no WhatsApp';
      btnFinalizar.disabled = !lojaAbertaAgora();
    }
  }
}

window.onclick = function (event) {
  const modal = document.getElementById('modalCarrinho');
  if (event.target === modal) {
    fecharCarrinho();
  }
};

async function iniciarSistema() {
  await carregarConfiguracaoLoja();
  await carregarRegrasEntrega();
  aplicarMascaraCep();
  aplicarEventosEntrega();
  atualizarContadores();
  atualizarEntrega();
  atualizarStatusLoja();
  setInterval(atualizarStatusLoja, 60000);

  console.log('Sistema iniciado com OpenStreetMap + OSRM.');
}

iniciarSistema();
