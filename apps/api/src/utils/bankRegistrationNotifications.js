const prisma = require('../prismaClient');
const { createNotification } = require('./workflow');

const registrationTarget = user => `/bank-team?${new URLSearchParams({ bankId: user.bankId, tab: 'members', member: user.id })}`;

async function notifyBankRegistration(req, user) {
  const recipients = await prisma.user.findMany({
    where: { OR: [{ userRole: 'ADMIN' }, ...(user.bankRole === 'EMPLOYEE' ? [{ userRole: 'BANK', bankId: user.bankId, bankRole: 'ADMIN', bankStatus: 'APPROVED' }] : [])] },
    select: { id: true }
  });
  await Promise.all(recipients.map(recipient => createNotification(req, {
    userId: recipient.id,
    type: 'BANK_REGISTRATION',
    message: `${user.name} requested ${user.bankRole === 'ADMIN' ? 'Bank Admin' : 'employee'} access for ${user.bankName}. Review in Bank Team & Targets.`,
    targetUrl: registrationTarget(user)
  })));
}
module.exports = { notifyBankRegistration, registrationTarget };
