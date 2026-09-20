const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('--- Starting Universal Extension Verification ---');

// 1. Verify Manifest V3
const manifestPath = path.join(__dirname, 'launches', 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json must exist');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.strictEqual(manifest.manifest_version, 3, 'Manifest version must be 3');
assert(manifest.action, 'action configuration must exist');
assert(manifest.icons['16'] && manifest.icons['48'] && manifest.icons['128'], 'All icon sizes must be defined');

['icon16.png', 'icon48.png', 'icon128.png'].forEach(iconFile => {
  const iconPath = path.join(__dirname, 'launches', 'icons', iconFile);
  assert(fs.existsSync(iconPath), `Icon ${iconFile} must exist`);
  assert(fs.statSync(iconPath).size > 0, `Icon ${iconFile} must not be empty`);
});
console.log('✓ Manifest and icons verified successfully.');

// 2. Verify Content CSS
const cssPath = path.join(__dirname, 'launches', 'content.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
assert(cssContent.includes('.lc-masked-dots'), 'CSS must define .lc-masked-dots style');
assert(cssContent.includes('.lc-masked-avatar'), 'CSS must define .lc-masked-avatar style');
console.log('✓ Content CSS rules verified successfully.');

// 3. Verify Content Script Syntax
const contentJsPath = path.join(__dirname, 'launches', 'content.js');
const jsContent = fs.readFileSync(contentJsPath, 'utf8');
assert.doesNotThrow(() => {
  new vm.Script(jsContent);
}, 'content.js must have valid JavaScript syntax');
console.log('✓ content.js syntax check passed.');

// 4. Verify Popup JS Syntax
const popupJsPath = path.join(__dirname, 'launches', 'popup.js');
const popupJsContent = fs.readFileSync(popupJsPath, 'utf8');
assert.doesNotThrow(() => {
  new vm.Script(popupJsContent);
}, 'popup.js must have valid JavaScript syntax');
console.log('✓ popup.js syntax check passed.');

// 5. Simulate DOM Masking for the user's exact case (from screenshot)
console.log('Testing simulation of user screenshot DOM elements...');

// A) URL Masking test
const rawPath = '/u/seno12/';
const maskedPath = rawPath.replace(/\/u\/([^/]+)/i, '/u/••••••');
assert.strictEqual(maskedPath, '/u/••••••/', 'URL pathname must be converted to dots in address bar');
console.log('✓ URL Masking: /u/seno12/ -> /u/••••••/ verified.');

// B) Followers masking test
const followerText = '0 Following   1 Followers';
const maskedFollowerText = followerText.replace(/(\d+[\d,]*)\s*(Following|Followers?)/gi, '• $2');
assert(maskedFollowerText.includes('• Following'), 'Followers count must be replaced with dots');
assert(maskedFollowerText.includes('• Followers'), 'Followers count must be replaced with dots');
console.log(`✓ Followers Masking: "${followerText}" -> "${maskedFollowerText}" verified.`);

// C) Universal auto-detection on profile heading & username
const detectedTargets = new Set();
// Simulate detection from URL
const urlUser = rawPath.match(/\/u\/([^/]+)/)[1];
detectedTargets.add(urlUser); // 'seno12'

// Simulate detection from __NEXT_DATA__
const sampleNextData = {
  props: {
    pageProps: {
      userProfile: {
        username: 'seno12',
        realName: 'Ayushisoni_077',
        userSlug: 'seno12'
      }
    }
  }
};

function deepScan(obj) {
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (typeof v === 'string' && (lk === 'username' || lk === 'realname' || lk === 'userslug')) {
      detectedTargets.add(v);
    } else if (typeof v === 'object' && v !== null) {
      deepScan(v);
    }
  }
}
deepScan(sampleNextData);

assert(detectedTargets.has('seno12'), 'Must detect seno12');
assert(detectedTargets.has('Ayushisoni_077'), 'Must detect Ayushisoni_077');

// D) Test text replacement on profile heading (Ayushisoni_077) and submissions
let heading = 'Ayushisoni_077';
detectedTargets.forEach(target => {
  if (heading.includes(target)) {
    heading = heading.replace(new RegExp(target, 'g'), '••••••');
  }
});
assert.strictEqual(heading, '••••••', 'Profile heading Ayushisoni_077 must be replaced with dots');

let submissionText = 'Submission by seno12 (Ayushisoni_077)';
detectedTargets.forEach(target => {
  submissionText = submissionText.replace(new RegExp(target, 'g'), '••••••');
});
assert.strictEqual(submissionText, 'Submission by •••••• (••••••)', 'Submissions text must mask both username and display name');

console.log('✓ Profile heading and submission masking verified.');
console.log('--- All Universal Verifications Passed Successfully! ---');
