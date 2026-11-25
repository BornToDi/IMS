"""Add locally identifiable presentation data without deleting existing records."""
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = root / 'apps/api/prisma/dev.db'
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
backup = db.with_name('dev-before-presentation.db')
if not backup.exists():
    with sqlite3.connect(backup) as out:
        con.backup(out)

def uid(): return str(uuid.uuid4())
def stamp(days=0): return int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp() * 1000)
def add(table, values):
    values = {'id': uid(), **values}
    keys = ','.join('"' + k + '"' for k in values)
    con.execute(f'INSERT INTO "{table}" ({keys}) VALUES ({",".join("?" for _ in values)})', list(values.values()))
    return values['id']

tag = 'Presentation sample — simulated data.'
admin = con.execute("SELECT id, name FROM User WHERE email='admin@admin.com'").fetchone()
engineer = con.execute("SELECT id, name FROM User WHERE email='enayet@gmail.com'").fetchone()
if not admin or not engineer: raise RuntimeError('Required local users are missing')
locations = ['Gulshan', 'Dhanmondi', 'Uttara', 'Mirpur', 'Motijheel', 'Banani', 'Mohakhali', 'Chattogram', 'Sylhet', 'Rajshahi']
merchants = ['City Mart', 'Green Pharmacy', 'Family Super Shop', 'Central Fashion', 'Metro Electronics', 'Fresh Foods', 'Park Restaurant', 'Modern Lifestyle']
bank_emails = {'BRAC Bank PLC':'brac@gmail.com', 'Pubali Bank':'pubali@gmail.com', 'United Commercial Bank PLC (UCB)':'ucb@gmail.com', 'Islami Bank Bangladesh PLC':'islami@gmail.com', 'Meghna Bank':'meghnabank@gmail.com'}

with con:
    for bank_index, (name, email) in enumerate(bank_emails.items(), 1):
        bank = con.execute('SELECT id FROM BankMaster WHERE name=?', (name,)).fetchone()
        member = con.execute('SELECT id FROM User WHERE email=?', (email,)).fetchone()
        if not bank or not member: raise RuntimeError('Missing bank or admin: ' + name)
        bank_id, bank_user = bank['id'], member['id']
        con.execute('UPDATE BankMaster SET branch=COALESCE(branch, ?), contactPerson=COALESCE(contactPerson, ?), agreementReference=COALESCE(agreementReference, ?), updatedAt=? WHERE id=?', ('Dhaka Main Branch', 'Bank Operations', f'PRESENTATION-{bank_index:02}', stamp(), bank_id))
        devices = con.execute('SELECT * FROM InventoryDevice WHERE bankId=? AND archived=0 AND deviceType=? ORDER BY serialNumber', (bank_id, 'POS')).fetchall()
        for i, device in enumerate(devices, 1):
            # Populate missing fields without replacing existing operational values.
            location = locations[(i-1) % len(locations)]
            merchant = f'{merchants[(i-1) % len(merchants)]} {location}'
            tid, mid = f'{bank_index:02}{i:06}', f'{bank_index:02}{i:013}'
            fields = {'supplier':'POS Technology Solutions', 'purchaseDate':stamp(-320), 'warrantyUntil':stamp(410), 'merchant':merchant, 'branch':location + ' Branch', 'tid':tid, 'mid':mid, 'address':f'{location}, Bangladesh', 'telco':['GP','Robi','Banglalink'][i%3], 'simEi':f'88019{bank_index:02}{i:08}', 'engineer':'Enayet Engineer', 'deploymentDate':stamp(-210), 'reference':f'PO-{bank_index:02}-{(i-1)//100+1:03}'}
            updates = ', '.join(f'"{key}"=COALESCE(NULLIF("{key}",\'\'), ?)' for key in fields)
            con.execute(f'UPDATE InventoryDevice SET {updates} WHERE id=?', [*fields.values(), device['id']])
            con.execute('UPDATE PosSerial SET location=COALESCE(NULLIF(location,\'\'),?), place=COALESCE(NULLIF(place,\'\'),?), tidNumber=COALESCE(NULLIF(tidNumber,\'\'),?), midNumber=COALESCE(NULLIF(midNumber,\'\'),?), merchantName=COALESCE(NULLIF(merchantName,\'\'),?), merchantAddress=COALESCE(NULLIF(merchantAddress,\'\'),?), merchantStatus=COALESCE(NULLIF(merchantStatus,\'\'),?), operator=COALESCE(NULLIF(operator,\'\'),?), simNumber=COALESCE(NULLIF(simNumber,\'\'),?) WHERE serialNumber=?', (location, 'Retail', device['tid'] or tid, device['mid'] or mid, device['merchant'] or merchant, device['address'] or fields['address'], 'ACTIVE', device['telco'] or fields['telco'], device['simEi'] or fields['simEi'], device['serialNumber']))
            # Synthetic timeline is explicitly identified and ends at the current state.
            existing = con.execute("SELECT count(*) FROM InventoryEvent WHERE deviceId=? AND remarks LIKE 'Presentation sample% '", (device['id'],)).fetchone()[0]
            marker = con.execute('SELECT count(*) FROM InventoryEvent WHERE deviceId=? AND remarks=?', (device['id'], tag)).fetchone()[0]
            if not marker:
                status = device['status']
                steps = [('STOCK_IN', None, 'RECEIVED'), ('RESTOCK', 'RECEIVED', 'IN_STOCK'), ('TRANSFER', 'IN_STOCK', 'IN_STOCK'), ('EDIT', 'IN_STOCK', 'IN_STOCK')]
                if status != 'IN_STOCK': steps += [('EDIT', 'IN_STOCK', status)]
                for step, (action, previous, current) in enumerate(steps):
                    add('InventoryEvent', {'deviceId':device['id'], 'action':action, 'previousStatus':previous, 'newStatus':current, 'actorId':admin['id'], 'actorName':admin['name'], 'remarks':tag, 'details':json.dumps({'source':'presentation_sample','serialNumber':device['serialNumber']}), 'occurredAt':stamp(-250+step*20), 'createdAt':stamp(-250+step*20)})
        # One connected example per module and bank, re-runnable by unique title.
        title = f'{name} POS service and rollout'
        if con.execute('SELECT 1 FROM Workspace WHERE name=?', (title,)).fetchone(): continue
        sample = devices[0]
        ticket = add('BankTicket', {'ticketNo':f'PRES-{bank_index:03}', 'title':'POS connectivity support', 'description':tag, 'bankName':name, 'bankUserId':bank_user, 'assignedAdminId':admin['id'], 'assignedEmployeeId':engineer['id'], 'status':'IN_PROGRESS', 'priority':'NORMAL', 'serviceType':'Maintenance', 'posSerial':sample['serialNumber'], 'tidNumber':sample['tid'] or f'{bank_index:02}000001', 'zoneName':'Dhaka', 'merchantAddress':'Gulshan, Dhaka', 'createdAt':stamp(-12), 'updatedAt':stamp(-1)})
        add('TicketUpdate', {'ticketId':ticket, 'userId':admin['id'], 'type':'COMMENT', 'message':'Service team assigned. ' + tag, 'createdAt':stamp(-10)})
        ws = add('Workspace', {'name':title, 'description':tag, 'ownerId':admin['id'], 'assignedEmployeeId':engineer['id'], 'bankName':name, 'ticketId':ticket, 'posSerial':sample['serialNumber'], 'taskStatus':'IN_PROGRESS', 'serviceType':'Maintenance', 'createdAt':stamp(-12), 'updatedAt':stamp(-1)})
        for user, role in [(admin['id'],'OWNER'), (engineer['id'],'MEMBER'), (bank_user,'MEMBER')]: add('WorkspaceMember', {'workspaceId':ws, 'userId':user, 'role':role})
        goal = add('Goal', {'workspaceId':ws, 'title':'Complete POS deployment and service', 'description':tag, 'ownerId':engineer['id'], 'status':'IN_PROGRESS', 'dueDate':stamp(14), 'updatedAt':stamp()})
        add('Milestone', {'goalId':goal, 'title':'Merchant validation', 'progress':75, 'updatedAt':stamp()})
        add('GoalActivity', {'goalId':goal, 'userId':engineer['id'], 'message':'Merchant site verification in progress. ' + tag})
        add('ActionItem', {'workspaceId':ws, 'goalId':goal, 'title':'Verify terminal connectivity', 'description':tag, 'assigneeId':engineer['id'], 'priority':'HIGH', 'status':'TODO', 'dueDate':stamp(3), 'updatedAt':stamp()})
        add('WorkspaceUpdate', {'workspaceId':ws, 'employeeId':engineer['id'], 'serviceType':'Maintenance', 'status':'IN_PROGRESS', 'remarks':'Initial inspection completed. ' + tag})
        add('Announcement', {'workspaceId':ws, 'authorId':admin['id'], 'title':'Weekly POS operations update', 'content':'Please review current deployments and service tickets. ' + tag, 'updatedAt':stamp()})
        add('Message', {'workspaceId':ws, 'authorId':engineer['id'], 'content':'Site visit scheduled and merchant contacted. ' + tag})
        meeting = add('Meeting', {'workspaceId':ws, 'title':'POS service review', 'description':tag, 'organizerId':admin['id'], 'startTime':stamp(1), 'endTime':stamp(1)+3600000, 'location':'Operations office', 'updatedAt':stamp()})
        add('MeetingInvite', {'meetingId':meeting, 'userId':engineer['id'], 'status':'ACCEPTED', 'updatedAt':stamp()})
        add('Notification', {'userId':bank_user, 'workspaceId':ws, 'type':'BANK_TEAM', 'message':'A POS service update is available. ' + tag, 'targetUrl':'/bank-team'})
        target = add('BankTarget', {'bankId':bank_id, 'employeeId':bank_user, 'title':'Monthly POS verification', 'quantity':25, 'startsAt':stamp(-15), 'dueAt':stamp(15), 'status':'ACTIVE', 'createdBy':admin['id']})
        for device in devices[:5]:
            if not con.execute('SELECT 1 FROM BankPosAssignment WHERE deviceId=?', (device['id'],)).fetchone():
                con.execute('INSERT INTO BankPosAssignment (deviceId, employeeId, assignedBy, assignedAt) VALUES (?,?,?,?)', (device['id'],bank_user,admin['id'],stamp(-10)))
                add('BankAssignmentHistory', {'bankId':bank_id,'deviceId':device['id'],'serialNumber':device['serialNumber'],'employeeId':bank_user,'employeeName':name+' Admin','actorId':admin['id'],'action':'ASSIGN','note':tag,'createdAt':stamp(-10)})
            add('BankTargetCompletion', {'targetId':target,'deviceId':device['id'],'serialNumber':device['serialNumber'],'note':tag,'status':'APPROVED','reviewedBy':admin['id'],'reviewedAt':stamp(-1),'reviewNote':tag,'createdAt':stamp(-2)})
        batch = add('HardwareBatch', {'batchNo':f'PRES-{bank_index:03}', 'bankName':name, 'ticketId':ticket, 'createdById':admin['id'], 'assignedToId':engineer['id'], 'totalQuantity':1, 'receivedQuantity':1, 'pendingQuantity':1, 'status':'RECEIVED', 'note':tag, 'updatedAt':stamp()})
        add('HardwareItem', {'batchId':batch,'serialNumber':sample['serialNumber'],'problem':'Connectivity issue','note':tag,'status':'PENDING','updatedAt':stamp()})
        add('HardwareUpdate', {'batchId':batch,'userId':engineer['id'],'type':'COMMENT','comment':'Initial diagnosis scheduled. '+tag})
        print(name, len(devices), 'devices populated')
    if not con.execute('SELECT 1 FROM GlobalMessage WHERE content=?', ('Operations update: all bank teams are reviewing POS service requests. '+tag,)).fetchone():
        add('GlobalMessage', {'authorId':admin['id'], 'content':'Operations update: all bank teams are reviewing POS service requests. '+tag})
print('Backup:', backup)
