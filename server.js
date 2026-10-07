const express=require('express');
const session=require('express-session');
const bcrypt=require('bcryptjs');
const multer=require('multer');
const slugify=require('slugify');
const {Pool}=require('pg');
const cloudinary=require('cloudinary').v2;
const crypto=require('crypto');
require('dotenv').config?.();
const app=express();
const PORT=process.env.PORT||3000;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});
if(process.env.CLOUDINARY_CLOUD_NAME) cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||'CHANGE_THIS_SESSION_SECRET',resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000}}));
const categories=['জাতীয়','রাজনীতি','আন্তর্জাতিক','অর্থনীতি','খেলাধুলা','বিনোদন','শিক্ষা','সারাদেশ','লাইফস্টাইল','প্রযুক্তি'];
async function q(sql,params=[]){return (await pool.query(sql,params)).rows}
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS admins(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS reporters(id SERIAL PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',email TEXT DEFAULT '',district TEXT DEFAULT '',bio TEXT DEFAULT '',active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS news(id SERIAL PRIMARY KEY,title TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,category TEXT NOT NULL,summary TEXT DEFAULT '',body TEXT DEFAULT '',image_url TEXT DEFAULT '',reporter_id INTEGER REFERENCES reporters(id) ON DELETE SET NULL,reporter_name TEXT DEFAULT '',status TEXT DEFAULT 'draft',featured BOOLEAN DEFAULT FALSE,breaking BOOLEAN DEFAULT FALSE,views INTEGER DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`);
 const a=await q('SELECT id FROM admins LIMIT 1'); if(!a.length){const pw=await bcrypt.hash(process.env.ADMIN_PASSWORD||'ChangeMe123!',12);await pool.query('INSERT INTO admins(username,password_hash) VALUES($1,$2)',[process.env.ADMIN_USERNAME||'admin',pw]);}
 const r=await q('SELECT id FROM reporters LIMIT 1'); if(!r.length) await pool.query('INSERT INTO reporters(name,phone,district) VALUES($1,$2,$3)', ['JonoBarta Desk','','ঢাকা']);
}
function auth(req,res,next){if(!req.session.adminId)return res.status(401).json({error:'Admin login required'});next()}
function makeSlug(title){return slugify(title,{lower:true,strict:true,locale:'bn'})+'-'+crypto.randomBytes(3).toString('hex')}
async function imageUrl(file){if(!file)return ''; if(!process.env.CLOUDINARY_CLOUD_NAME)return ''; return new Promise((resolve,reject)=>{const s=cloudinary.uploader.upload_stream({folder:'jonobarta/news'},(e,r)=>e?reject(e):resolve(r.secure_url));s.end(file.buffer)})}
app.get('/api/health',async(_,res)=>{try{await q('SELECT 1');res.json({ok:true,database:'online',imageHosting:!!process.env.CLOUDINARY_CLOUD_NAME})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.post('/api/login',async(req,res)=>{const {username,password}=req.body;const rows=await q('SELECT * FROM admins WHERE username=$1',[username]);if(!rows.length||!await bcrypt.compare(password,rows[0].password_hash))return res.status(401).json({error:'ভুল ইউজারনেম বা পাসওয়ার্ড'});req.session.adminId=rows[0].id;res.json({ok:true,username:rows[0].username})});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({loggedIn:!!req.session.adminId}));
app.get('/api/categories',(req,res)=>res.json(categories));
app.get('/api/reporters',auth,async(_,res)=>res.json(await q('SELECT * FROM reporters ORDER BY id DESC')));
app.post('/api/reporters',auth,async(req,res)=>{const {name,phone='',email='',district='',bio=''}=req.body;if(!name)return res.status(400).json({error:'Reporter name required'});const r=await q('INSERT INTO reporters(name,phone,email,district,bio) VALUES($1,$2,$3,$4,$5) RETURNING *',[name,phone,email,district,bio]);res.json(r[0])});
app.put('/api/reporters/:id',auth,async(req,res)=>{const {name,phone='',email='',district='',bio='',active=true}=req.body;const r=await q('UPDATE reporters SET name=$1,phone=$2,email=$3,district=$4,bio=$5,active=$6 WHERE id=$7 RETURNING *',[name,phone,email,district,bio,active,req.params.id]);res.json(r[0])});
app.delete('/api/reporters/:id',auth,async(req,res)=>{await q('DELETE FROM reporters WHERE id=$1',[req.params.id]);res.json({ok:true})});
app.get('/api/news',async(req,res)=>{const {q:term,category,status}=req.query;let sql=`SELECT n.*,COALESCE(r.name,n.reporter_name) AS reporter FROM news n LEFT JOIN reporters r ON r.id=n.reporter_id WHERE 1=1`;const p=[];if(status==='all'&&req.session.adminId){}else{sql+=' AND n.status=$'+(p.length+1);p.push('published')}if(category){sql+=' AND n.category=$'+(p.length+1);p.push(category)}if(term){sql+=' AND (n.title ILIKE $'+(p.length+1)+' OR n.body ILIKE $'+(p.length+1)+')';p.push('%'+term+'%')}sql+=' ORDER BY n.breaking DESC,n.featured DESC,n.created_at DESC';res.json(await q(sql,p))});
app.get('/api/news/:slug',async(req,res)=>{const rows=await q('SELECT n.*,COALESCE(r.name,n.reporter_name) AS reporter,COALESCE(r.phone,\'\') AS reporter_phone FROM news n LEFT JOIN reporters r ON r.id=n.reporter_id WHERE n.slug=$1',[req.params.slug]);if(!rows.length)return res.status(404).json({error:'News not found'});await q('UPDATE news SET views=views+1 WHERE id=$1',[rows[0].id]);rows[0].views++;res.json(rows[0])});
app.post('/api/news',auth,upload.single('image'),async(req,res)=>{try{const {title,category,summary='',body='',reporter_id='',status='draft',featured='false',breaking='false'}=req.body;if(!title||!category)return res.status(400).json({error:'Title and category required'});let image_url=await imageUrl(req.file);let reporter_name='';if(reporter_id){const rr=await q('SELECT name FROM reporters WHERE id=$1',[reporter_id]);reporter_name=rr[0]?.name||''}const slug=makeSlug(title);const n=await q('INSERT INTO news(title,slug,category,summary,body,image_url,reporter_id,reporter_name,status,featured,breaking) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[title,slug,category,summary,body,image_url,reporter_id||null,reporter_name,status,featured==='true',breaking==='true']);res.json(n[0])}catch(e){res.status(500).json({error:e.message})}});
app.put('/api/news/:id',auth,upload.single('image'),async(req,res)=>{try{const old=(await q('SELECT * FROM news WHERE id=$1',[req.params.id]))[0];if(!old)return res.status(404).json({error:'Not found'});const {title,category,summary='',body='',reporter_id='',status='draft',featured='false',breaking='false'}=req.body;let image_url=old.image_url;if(req.file)image_url=await imageUrl(req.file);let reporter_name=old.reporter_name;if(reporter_id){const rr=await q('SELECT name FROM reporters WHERE id=$1',[reporter_id]);reporter_name=rr[0]?.name||''}const n=await q('UPDATE news SET title=$1,category=$2,summary=$3,body=$4,image_url=$5,reporter_id=$6,reporter_name=$7,status=$8,featured=$9,breaking=$10,updated_at=NOW() WHERE id=$11 RETURNING *',[title,category,summary,body,image_url,reporter_id||null,reporter_name,status,featured==='true',breaking==='true',req.params.id]);res.json(n[0])}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/news/:id',auth,async(req,res)=>{await q('DELETE FROM news WHERE id=$1',[req.params.id]);res.json({ok:true})});
app.get('/api/stats',auth,async(_,res)=>{const r=await q(`SELECT COUNT(*) FILTER(WHERE true)::int total,COUNT(*) FILTER(WHERE status='published')::int published,COUNT(*) FILTER(WHERE status='draft')::int drafts,COALESCE(SUM(views),0)::int views FROM news`);const rep=await q('SELECT COUNT(*)::int count FROM reporters');res.json({...r[0],reporters:rep[0].count})});
app.use(express.static(__dirname+'/public'));
app.get('*',(req,res)=>res.sendFile(__dirname+'/public/index.html'));
init().then(()=>app.listen(PORT,()=>console.log(`JonoBarta running on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
