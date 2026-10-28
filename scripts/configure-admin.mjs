import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const input=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try {
 const username=(await input.question('Teacher username: ')).trim();
 const answer=input.question('Teacher password (input hidden): ');muted=true;
 const password=await answer;muted=false;process.stdout.write('\n');
 if(!username||password.length<12)throw new Error('Use a username and a password of at least 12 characters.');
 const hash=scryptSync(password,'matrona-local-login-v1',64).toString('hex');
 const file='.env.local';
 let env=existsSync(file)?readFileSync(file,'utf8'):'';
 env=env.split(/\r?\n/).filter(line=>!/^ADMIN_(USERNAME|PASSWORD_HASH)=/.test(line)).join('\n');
 writeFileSync(file,`${env.trim()}\nADMIN_USERNAME=${JSON.stringify(username)}\nADMIN_PASSWORD_HASH=${hash}\n`,{mode:0o600});
 chmodSync(file,0o600);
 console.log('Private login configuration saved to .env.local (excluded from Git).');
} finally {muted=false;input.close();}
