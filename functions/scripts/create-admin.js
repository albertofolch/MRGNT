// Run from functions/: node scripts/create-admin.js <email> <password>
// Requires GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC:
//   gcloud auth application-default login

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'mrgnt-webpage',
});

async function createAdmin(email, password) {
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email, password });
    console.log(`Created user: ${userRecord.uid}`);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      userRecord = await admin.auth().getUserByEmail(email);
      console.log(`User already exists: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }
  await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true, role: 'admin' });
  console.log(`Admin claim set for ${email} (${userRecord.uid})`);
}

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password>');
  process.exit(1);
}

createAdmin(email, password).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
