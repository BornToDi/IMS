// Company roster order supplied for attendance reports (image serials 6–38).
const roster = [
  'Sayed Arefin Hasan',
  'Mir Raihan Hossain',
  'Susanta Kumar Das',
  'Rakib Hasan Riday',
  'Riadul Islam',
  'Suzan Chandra Deb Sharma',
  'Anik Kumar Sutradhar',
  'Mosaddik Hossain',
  'Ridoy Kumar Sutradhar',
  'Jehad Hasan',
  'Sheikh Sabbir Hossain',
  'M. A. Al Mahmud',
  'Osman Goni Fardin',
  'Md. Ekhlach Hossain',
  'Azad Khan',
  'Md. Ariful Islam',
  'MD. Rubel Ali',
  'Rakibul Islam',
  'MD. Tareq Aziz Sakib',
  'Md. Jowel Mia',
  'Md. Arif Istiak',
  'Rohan Bin Alom',
  'Md. Sayed Hassan',
  'Apurbo Sarker',
  'MD. Tarikul Islam',
  'Zitu Sikder',
  'Nahid Sarkar',
  'Apurba Bepari',
  'Nayem Hasan',
  'MD. Tanvir Ahamed',
  'Md. Mehedi Hassan',
  'Shoaib Akter',
  'Rajib Chandra Sen'
];

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\(\s*pos\s*\)/g, '').replace(/[^a-z0-9]/g, '');
}
const ranks = new Map(roster.map((name, index) => [normalizeName(name), index]));

function compareAttendanceEmployees(a, b) {
  const rank = name => ranks.get(normalizeName(name)) ?? roster.length;
  return rank(a.name) - rank(b.name) || String(a.name || '').localeCompare(String(b.name || '')) ||
    String(a.employeeCode || '').localeCompare(String(b.employeeCode || '')) ||
    String(a.employeeId || a.id || '').localeCompare(String(b.employeeId || b.id || ''));
}

module.exports = { compareAttendanceEmployees };
