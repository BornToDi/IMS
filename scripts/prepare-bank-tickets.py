"""Create local presentation tickets with linked timelines and workspaces."""
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
backup = db.with_name('dev-before-sample-tickets.db')
if not backup.exists():
    with sqlite3.connect(backup) as target: con.backup(target)
def uid(): return str(uuid.uuid4())
def add(table, data):
    data = {'id':uid(), **data}
    con.execute(f'INSERT INTO "{table}" ({",".join(chr(34)+key+chr(34) for key in data)}) VALUES ({",".join("?" for _ in data)})', list(data.values()))
    return data['id']
now = datetime.now(timezone.utc)
def ts(days): return int((now+timedelta(days=days)).timestamp()*1000)
admin = con.execute("SELECT id FROM User WHERE email='admin@admin.com'").fetchone()['id']
engineers = [r['id'] for r in con.execute("SELECT id FROM User WHERE userRole IN ('EMPLOYEE','FIELD_EMPLOYEE') ORDER BY email").fetchall()]
if not engineers: raise RuntimeError('No field employee found')
emails = {'BRAC Bank PLC':'brac@gmail.com','Pubali Bank':'pubali@gmail.com','United Commercial Bank PLC (UCB)':'ucb@gmail.com','Islami Bank Bangladesh PLC':'islami@gmail.com','Meghna Bank':'meghnabank@gmail.com'}
services = [('Installation','New POS installation'),('Maintenance','Preventive maintenance'),('Repair','Printer issue'),('Network issue','Network connectivity issue'),('POS not working','POS terminal not responding'),('Paper roll issue','Receipt paper issue'),('Settlement issue','Settlement investigation'),('Replacement','Terminal replacement')]
note = 'Presentation sample — simulated service ticket.'
with con:
    for index, (name, email) in enumerate(emails.items(), 1):
        bank = con.execute('SELECT id FROM BankMaster WHERE name=?',(name,)).fetchone()
        user = con.execute('SELECT id FROM User WHERE email=?',(email,)).fetchone()
        if not bank or not user: raise RuntimeError('Missing bank or admin: '+name)
        devices = con.execute("SELECT serialNumber,tid,location,address FROM InventoryDevice WHERE bankId=? AND archived=0 AND tid IS NOT NULL ORDER BY serialNumber LIMIT 50",(bank['id'],)).fetchall()
        if len(devices)<50: raise RuntimeError('Not enough POS for '+name)
        created = 0
        for i, device in enumerate(devices):
            code = f'PRESENT-{index:02}-{i+1:03}'
            if con.execute('SELECT 1 FROM BankTicket WHERE ticketNo=?',(code,)).fetchone(): continue
            status = 'SUBMITTED' if i<15 else 'ASSIGNED' if i<25 else 'IN_PROGRESS' if i<35 else 'COMPLETED'
            service, title = services[i%len(services)]
            employee = engineers[i%len(engineers)]
            start = ts(-5-(i%45)); updated = min(ts(-1),start+3*86400000)
            ticket = add('BankTicket', {'ticketNo':code,'title':title,'description':note,'tidNumber':device['tid'],'posSerial':device['serialNumber'],'zoneName':device['location'] or 'Dhaka','serviceType':service,'merchantAddress':device['address'] or 'Dhaka, Bangladesh','bankName':name,'priority':['NORMAL','NORMAL','HIGH','URGENT'][i%4],'status':status,'bankUserId':user['id'],'assignedAdminId':admin if status!='SUBMITTED' else None,'assignedEmployeeId':employee if status!='SUBMITTED' else None,'createdAt':start,'updatedAt':updated})
            add('TicketUpdate', {'ticketId':ticket,'userId':user['id'],'type':'SUBMITTED','message':'Service request submitted. '+note,'createdAt':start})
            if status != 'SUBMITTED':
                add('TicketUpdate', {'ticketId':ticket,'userId':admin,'type':'ASSIGNED','message':'Assigned to the field service team. '+note,'createdAt':start+86400000})
                task_status = {'ASSIGNED':'PENDING','IN_PROGRESS':'IN_PROGRESS','COMPLETED':'COMPLETED'}[status]
                ws = add('Workspace', {'name':code+' • '+title,'description':note,'tidNumber':device['tid'],'posSerial':device['serialNumber'],'zoneName':device['location'] or 'Dhaka','serviceType':service,'merchantAddress':device['address'] or 'Dhaka, Bangladesh','bankName':name,'taskStatus':task_status,'assignedEmployeeId':employee,'ownerId':admin,'ticketId':ticket,'startedAt':start+86400000 if status in ('IN_PROGRESS','COMPLETED') else None,'completedAt':updated if status=='COMPLETED' else None,'createdAt':start,'updatedAt':updated})
                for uid_,role in [(admin,'ADMIN'),(employee,'FIELD_EMPLOYEE')]: add('WorkspaceMember',{'workspaceId':ws,'userId':uid_,'role':role,'createdAt':start})
                if status in ('IN_PROGRESS','COMPLETED'):
                    msg = 'Service completed and terminal verified. ' if status=='COMPLETED' else 'Engineer is working on the service request. '
                    add('TicketUpdate',{'ticketId':ticket,'userId':employee,'type':status,'message':msg+note,'createdAt':updated})
                    add('WorkspaceUpdate',{'workspaceId':ws,'employeeId':employee,'serviceType':service,'remarks':msg+note,'status':task_status,'createdAt':updated})
            created += 1
        print(name, 'new tickets:',created)
print('Backup:',backup)
