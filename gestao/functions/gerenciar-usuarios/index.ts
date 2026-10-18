import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLISHABLE = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ALLOWED = new Set(["https://brunodev-creator.github.io", "http://localhost:8080", "http://127.0.0.1:8080"]);
const ROLES = new Set(["chefia","compras","licitacao","sofi","leitura","chefe_compras","chefe_licitacao","chefe_sofi"]);
const SECTORS = new Set(["Compras","Licitação","SOFI"]);
const roleSetor: Record<string,string> = {
 compras:"Compras",licitacao:"Licitação",sofi:"SOFI",
 chefe_compras:"Compras",chefe_licitacao:"Licitação",chefe_sofi:"SOFI"
};
const supabase = createClient(URL, SERVICE_KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
function respond(req:Request, data:unknown, status=200) {
 const origin=req.headers.get("Origin") || "";
 const headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};
 if(ALLOWED.has(origin)){headers["Access-Control-Allow-Origin"]=origin;headers["Access-Control-Allow-Headers"]="authorization, apikey, content-type, x-client-info, prefer, accept";headers["Access-Control-Allow-Methods"]="POST, OPTIONS"}
 return new Response(JSON.stringify(data),{status,headers});
}
function clean(v:unknown,max=120){return typeof v==="string"?v.trim().slice(0,max):""}
function validRoleAndSetor(role:string,setor:string){
 return ROLES.has(role) && (roleSetor[role]?roleSetor[role]===setor: (setor===""||SECTORS.has(setor)));
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return respond(req,{ok:true});
 if(req.method!=="POST") return respond(req,{erro:"Método não permitido"},405);
 const origin=req.headers.get("Origin")||"";
 if(origin&&!ALLOWED.has(origin))return respond(req,{erro:"Origem não autorizada"},403);
 if(!URL||!SERVICE_KEY||!PUBLISHABLE)return respond(req,{erro:"Configuração do servidor indisponível"},503);
 const auth=req.headers.get("Authorization")||"";
 const token=auth.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return respond(req,{erro:"Token obrigatório"},401);
 try {
  const client=createClient(URL,PUBLISHABLE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:verified,error:authError}=await client.auth.getUser(token);
  if(authError||!verified.user)return respond(req,{erro:"Sessão inválida"},401);
  const {data:actor,error:actorError}=await supabase.from("usuarios").select("role,ativo").eq("auth_id",verified.user.id).maybeSingle();
  if(actorError||!actor?.ativo||actor.role!=="admin")return respond(req,{erro:"Acesso exclusivo do administrador"},403);
  let args:Record<string,unknown>;
  try {args=await req.json();}catch{return respond(req,{erro:"JSON inválido"},400)}
  const acao=clean(args.acao,30);
  if(acao==="listar"){
   const {data:authList,error:listError}=await supabase.auth.admin.listUsers({page:1,perPage:1000});
   if(listError)throw listError;
   const {data:profiles,error:dbError}=await supabase.from("usuarios").select("auth_id,nome,role,setor,ativo");
   if(dbError)throw dbError;
   const byId=new Map((profiles||[]).map(p=>[p.auth_id,p]));
   const usuarios=(authList.users||[]).filter(u=>byId.has(u.id)).map(u=>{
     const p=byId.get(u.id);
     return {auth_id:u.id,email:u.email,nome:p.nome,role:p.role,setor:p.setor,ativo:p.ativo,
       confirmado:!!u.email_confirmed_at,ultimo_acesso:u.last_sign_in_at||null};
   });
   return respond(req,{usuarios,parcial:(authList.users||[]).length===1000});
  }
  if(acao==="convidar"){
   const email=clean(args.email,254).toLowerCase();
   const nome=clean(args.nome,100),role=clean(args.role,32),setor=clean(args.setor,30);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||nome.length<3||!validRoleAndSetor(role,setor))
    return respond(req,{erro:"E-mail, nome, perfil ou setor inválido"},400);
   const {data:existingList,error:usersError}=await supabase.auth.admin.listUsers({page:1,perPage:1000});
   if(usersError)throw usersError;
   let user=existingList.users.find(u=>u.email?.toLowerCase()===email);
   let novo=false;
   if(!user){
    const {data:inv,error:invError}=await supabase.auth.admin.inviteUserByEmail(email,{
       redirectTo:"https://brunodev-creator.github.io/painel-tarefas-csatic/gestao/"
    });
    if(invError)throw invError;
    user=inv.user;
    novo=true;
   }
   if(!user)return respond(req,{erro:"Falha ao recuperar usuário criado"},500);
   const {data:old}=await supabase.from("usuarios").select("role").eq("auth_id",user.id).maybeSingle();
   if(old?.role==="admin")return respond(req,{erro:"Não é permitido rebaixar um administrador"},403);
   const {error:saveError}=await supabase.from("usuarios").upsert({
     auth_id:user.id,nome,role,setor:setor||null,ativo:true
   },{onConflict:"auth_id"});
   if(saveError)throw saveError;
   return respond(req,{ok:true,novo,mensagem:novo?"Convite solicitado ao serviço de e-mail.":"Conta existente autorizada; o usuário utiliza sua senha atual."});
  }
  if(acao==="atualizar"){
   const authId=clean(args.auth_id,60);
   const nome=clean(args.nome,100),role=clean(args.role,32),setor=clean(args.setor,30);
   const ativo=args.ativo===true;
   if(!/^[0-9a-f-]{36}$/i.test(authId)||nome.length<3||!validRoleAndSetor(role,setor))
    return respond(req,{erro:"Dados de atualização inválidos"},400);
   if(authId===verified.user.id)return respond(req,{erro:"Não é permitido alterar seu próprio perfil por esta tela"},403);
   const {data:old,error:oldError}=await supabase.from("usuarios").select("role").eq("auth_id",authId).maybeSingle();
   if(oldError||!old)return respond(req,{erro:"Perfil não encontrado"},404);
   if(old.role==="admin")return respond(req,{erro:"Administradores não podem ser editados por esta tela"},403);
   const {error:updateError}=await supabase.from("usuarios").update({nome,role,setor:setor||null,ativo}).eq("auth_id",authId);
   if(updateError)throw updateError;
   return respond(req,{ok:true,mensagem:ativo?"Perfil atualizado.":"Acesso desativado no banco."});
  }
  return respond(req,{erro:"Ação desconhecida"},400);
 }catch(e){
   const message=e instanceof Error?e.message:"Falha inesperada";
   return respond(req,{erro:message.slice(0,220)},400);
 }
});
