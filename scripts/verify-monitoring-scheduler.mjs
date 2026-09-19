/** Local PostgreSQL contract checks; HTTP and Vault are synthetic, with no network I/O.
 * The fixture registers http 1.6 metadata only in this disposable PGlite database.
 * Its transport stub checks the HEAD request and TLS/deadline options. Actual
 * extension behavior and hosted ACLs remain separate deployment checks. Local
 * revocation assertions cover tenant-owned fixtures; managed extension grants
 * can remain present in production without exposing the private helper/Vault.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.BUFFER_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
let checks=0;
const valid={duplicate:false,mode:'dry_run',checked:false,available:null,delivery:null,receipt:null};
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema extensions; create schema vault;
create table vault.secrets(name text,decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.secrets;
insert into vault.secrets values('buffer_monitor_cron_secret','local_scheduler_test_credential_00001');
grant all on vault.secrets,vault.decrypted_secrets to public,anon,authenticated;
create type extensions.http_header as (field varchar,value varchar);
create type extensions.http_request as (method text,uri varchar,headers extensions.http_header[],content_type varchar,content varchar);
create type extensions.http_response as (status integer,content_type varchar,headers extensions.http_header[],content varchar);
insert into pg_catalog.pg_extension(oid,extname,extowner,extnamespace,extrelocatable,extversion)
values(777777,'http',current_user::regrole,(select oid from pg_namespace where nspname='extensions'),true,'1.6');
create table private.fixture(status integer,headers extensions.http_header[],body text);
create table private.options(name text primary key,value text);
create function extensions.http_reset_curlopt() returns boolean language plpgsql as $$begin delete from private.options; return true; end$$;
create function extensions.http_set_curlopt(a text,b text) returns boolean language plpgsql as $$begin insert into private.options values(a,b) on conflict(name) do update set value=excluded.value; return true; end$$;
create function extensions.http(req extensions.http_request) returns extensions.http_response language plpgsql as $$
declare f private.fixture;
begin
 if req.method<>'HEAD' or req.uri<>'https://bufferonsolana.vercel.app/api/monitoring/worker' or req.content is not null then raise exception 'WRONG_TRANSPORT'; end if;
 if current_setting('http.timeout_msec')<>'55000' or current_setting('client_min_messages')<>'warning' then raise exception 'WRONG_SESSION_OPTIONS'; end if;
 if (select count(*) from private.options where (name,value) in (('CURLOPT_CONNECTTIMEOUT','5'),('CURLOPT_TIMEOUT_MS','55000'),('CURLOPT_SSL_VERIFYPEER','1'),('CURLOPT_SSL_VERIFYHOST','2'),('CURLOPT_PROXY','')))<>5 then raise exception 'WRONG_CURL_OPTIONS'; end if;
 if not exists(select 1 from unnest(req.headers) h where h.field='Authorization' and h.value='Bearer local_scheduler_test_credential_00001') then raise exception 'WRONG_AUTH'; end if;
 select * into f from private.fixture;
 return (f.status,'application/json',f.headers,f.body)::extensions.http_response;
end$$;
grant execute on function extensions.http(extensions.http_request) to public,anon,authenticated;
grant usage on schema private,extensions,vault to anon,authenticated,service_role;
`);
const setup=await readFile(new URL('../supabase/setup/monitoring-scheduler.sql', import.meta.url), 'utf8');
await db.exec(setup.replace(/^create extension[^\n]+\n/gm,''));
async function fixture(body,status=200,headers=1){
 await db.query('delete from private.fixture');
 await db.query(`insert into private.fixture values($1,case when $3=0 then array[]::extensions.http_header[] when $3=2 then array[('X-Buffer-Monitoring-Result',$2)::extensions.http_header,('x-buffer-monitoring-result',$2)::extensions.http_header] else array[('X-Buffer-Monitoring-Result',$2)::extensions.http_header] end,null)`,[status,typeof body==='string'?body:JSON.stringify(body),headers]);
}
async function succeeds(body){await fixture(body);assert.equal((await db.query('select private.invoke_buffer_monitor_worker() result')).rows[0].result,200);checks++;}
async function rejects(body,status=200,headers=1){await fixture(body,status,headers);await assert.rejects(db.query('select private.invoke_buffer_monitor_worker()'),e=>e.message==='Buffer scheduler invocation failed; inspect protected worker status');checks++;}
await succeeds(valid);
await succeeds({...valid,duplicate:true});
await succeeds({...valid,mode:'send',delivery:'accepted_by_provider'});
await succeeds({...valid,mode:'send',receipt:'delivered'});
await succeeds({...valid,checked:true,available:false});
for(const [body,status,headers] of [
 [valid,302,1],[valid,401,1],[valid,200,0],[valid,200,2],['x'.repeat(513),200,1],['badjson',200,1],
 [[],200,1],[{...valid,mode:['send']},200,1],[{...valid,duplicate:'true'},200,1],[{...valid,checked:null},200,1],
 [{...valid,available:'false'},200,1],[{...valid,delivery:['delivered']},200,1],[{...valid,receipt:'accepted'},200,1],
 [{...valid,extra:1},200,1],[Object.fromEntries(Object.entries(valid).filter(([k])=>k!=='receipt')),200,1]
]) await rejects(body,status,headers);
for(const role of ['anon','authenticated','service_role']){
 const row=(await db.query(`select has_function_privilege($1,'private.invoke_buffer_monitor_worker()','EXECUTE') allowed`,[role])).rows[0];assert.equal(row.allowed,false);checks++;
}
for(const role of ['anon','authenticated']){
 const row=(await db.query(`select has_function_privilege($1,'extensions.http(extensions.http_request)','EXECUTE') allowed,has_table_privilege($1,'vault.decrypted_secrets','SELECT') vault`,[role])).rows[0];assert.deepEqual(row,{allowed:false,vault:false});checks++;
}
await db.exec("set log_min_messages='debug2'");
await rejects(valid);
await db.exec("set log_min_messages='warning'; update vault.secrets set decrypted_secret='bad'");
await rejects(valid);
await db.exec("update vault.secrets set decrypted_secret='local_scheduler_test_credential_00001'; update pg_extension set extversion='1.7' where extname='http'");
await rejects(valid);
console.log(JSON.stringify({ result: 'PASS', assertions: checks, transport: 'mocked http 1.6 HEAD only', externalWrites: false, outboundRequests: 0 }, null, 2));
await db.close();
