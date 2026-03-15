const supabase = window.supabase.createClient(
APP_CONFIG.supabaseUrl,
APP_CONFIG.supabaseAnonKey
)

let pedidos = []

function byId(id){
return document.getElementById(id)
}

function formatarMoeda(v){
return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})
}

function tocarSom(){

try{

const ctx=new(window.AudioContext||window.webkitAudioContext)()

const osc=ctx.createOscillator()
const gain=ctx.createGain()

osc.type="sine"
osc.frequency.value=880

gain.gain.value=0.03

osc.connect(gain)
gain.connect(ctx.destination)

osc.start()
osc.stop(ctx.currentTime+0.2)

}catch(e){}

}

function buscarPedido(uid){
return pedidos.find(p=>p.uid===uid)
}

function normalizarPedido(p){

let itens=[]

try{
itens=Array.isArray(p.items)?p.items:JSON.parse(p.items||"[]")
}catch(e){
itens=[]
}

return{
uid:`${p.id}_${p.created_at}`,
bancoId:p.id,
id:"PED"+String(p.id).padStart(4,"0"),
cliente:p.customer_name||"",
telefone:p.customer_phone||"",
tipo:p.order_type||"",
endereco:p.customer_address||"",
obs:p.customer_notes||"",
status:p.status||"pendente",
itens,
total:p.total||0,
data:new Date(p.created_at)
}

}

async function carregarPedidos(){

const {data,error}=await supabase
.from("orders")
.select("*")
.order("created_at",{ascending:false})

if(error){
console.error(error)
return
}

const anterior=pedidos.length

pedidos=data.map(normalizarPedido)

if(pedidos.length>anterior){
tocarSom()
}

renderizar()

}

function criarItens(p){

if(!p.itens.length){
return `<small>Sem itens</small>`
}

return p.itens.map(i=>`

<div class="item-row">

<strong>${i.quantidade}x ${i.nome}</strong>

<span>${formatarMoeda(i.preco)}</span>

${i.observacao?`<small>${i.observacao}</small>`:""}

</div>

`).join("")

}

function criarCard(p,index){

const telefone=p.telefone.replace(/\D/g,"")

return`

<article class="order-card">

<div class="order-top">

<div class="order-id">${p.id}</div>

<div class="order-customer">${p.cliente}</div>

</div>

<div class="items-list">

${criarItens(p)}

</div>

<div class="order-total">

Total: ${formatarMoeda(p.total)}

</div>

<div class="order-actions">

<button class="btn btn-yellow btn-small"
onclick="alterarStatus(${index},'em preparo')">
Aceitar
</button>

<button class="btn btn-dark btn-small"
onclick="imprimirPedido('${p.uid}')">
Imprimir
</button>

<button class="btn btn-blue btn-small"
onclick="imprimirPedidoRapido('${p.uid}')">
Cozinha
</button>

<button class="btn btn-green btn-small"
onclick="abrirWhatsapp('${telefone}')">
WhatsApp
</button>

<button class="btn btn-dark btn-small"
onclick="copiarPedido('${p.uid}')">
Copiar
</button>

<button class="btn btn-red btn-small"
onclick="excluirPedido(${index})">
Excluir
</button>

</div>

</article>

`

}

function renderizar(){

const col=byId("colPendente")

if(!col)return

col.innerHTML=pedidos.map(criarCard).join("")

}

async function alterarStatus(index,status){

const pedido=pedidos[index]

const {error}=await supabase
.from("orders")
.update({status})
.eq("id",pedido.bancoId)

if(error){
alert("Erro ao atualizar status")
return
}

carregarPedidos()

}

async function excluirPedido(index){

const confirmar=confirm("Deseja realmente excluir este pedido?")
if(!confirmar)return

const pedido=pedidos[index]

const {error}=await supabase
.from("orders")
.delete()
.eq("id",pedido.bancoId)

if(error){
alert("Erro ao excluir pedido")
return
}

carregarPedidos()

}

function imprimirPedido(uid){

const p=buscarPedido(uid)
if(!p)return

const w=window.open("","","width=800,height=600")

w.document.write(`

<html>

<head>

<meta charset="UTF-8">

<style>

body{
font-family:Arial;
padding:20px
}

.item{
border-bottom:1px dashed #ccc;
padding:6px
}

</style>

</head>

<body>

<h2>Pedido ${p.id}</h2>

<p><strong>Cliente:</strong> ${p.cliente}</p>
<p><strong>Telefone:</strong> ${p.telefone}</p>

<h3>Itens</h3>

${p.itens.map(i=>`

<div class="item">

<strong>${i.quantidade}x ${i.nome}</strong>

<div>${formatarMoeda(i.preco*i.quantidade)}</div>

</div>

`).join("")}

<h3>Total: ${formatarMoeda(p.total)}</h3>

<script>
window.onload=function(){window.print()}
<\/script>

</body>

</html>

`)

}

function imprimirPedidoRapido(uid){

const p=buscarPedido(uid)
if(!p)return

const w=window.open("","","width=320,height=500")

w.document.write(`

<html>

<head>

<meta charset="UTF-8">

<style>

body{
font-family:monospace;
padding:10px;
font-size:16px
}

.item{
border-bottom:1px dashed #000;
padding:6px
}

</style>

</head>

<body>

<h3>PEDIDO ${p.id}</h3>

${p.itens.map(i=>`

<div class="item">

<strong>${i.quantidade}x ${i.nome}</strong>

${i.observacao?`<div>Obs: ${i.observacao}</div>`:""}

</div>

`).join("")}

<script>
window.onload=function(){window.print()}
<\/script>

</body>

</html>

`)

}

function copiarPedido(uid){

const p=buscarPedido(uid)
if(!p)return

const texto=

`Pedido ${p.id}

${p.itens.map(i=>`${i.quantidade}x ${i.nome}`).join("\n")}

Total: ${formatarMoeda(p.total)}
`

navigator.clipboard.writeText(texto)

alert("Pedido copiado")

}

function abrirWhatsapp(tel){

window.open(`https://wa.me/${tel}`,"_blank")

}

supabase
.channel("orders-realtime")
.on(
"postgres_changes",
{event:"INSERT",schema:"public",table:"orders"},
payload=>{
tocarSom()
carregarPedidos()
}
)
.subscribe()

carregarPedidos()

setInterval(carregarPedidos,5000)

window.excluirPedido=excluirPedido
window.imprimirPedido=imprimirPedido
window.imprimirPedidoRapido=imprimirPedidoRapido
window.copiarPedido=copiarPedido
window.abrirWhatsapp=abrirWhatsapp
window.alterarStatus=alterarStatus
