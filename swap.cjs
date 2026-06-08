const fs = require('fs');
const content = fs.readFileSync('src/pages/Checkout.tsx', 'utf-8');

const regex1 = /(<section className="mt-4 px-4">\s*<h3[^>]*>注文内容<\/h3>[\s\S]*?<\/section>)/;
const regex2 = /(<section className="mt-8 px-4">\s*<h3[^>]*>お客様情報<\/h3>[\s\S]*?<\/section>)/;

const match1 = content.match(regex1);
const match2 = content.match(regex2);

if (match1 && match2) {
  let newContent = content.replace(match1[0], '%%REPLACE1%%');
  newContent = newContent.replace(match2[0], '%%REPLACE2%%');
  
  // swap but change margins if needed
  let section1 = match1[0].replace('className="mt-4 px-4"', 'className="mt-8 px-4"');
  let section2 = match2[0].replace('className="mt-8 px-4"', 'className="mt-4 px-4"');

  newContent = newContent.replace('%%REPLACE1%%', section2);
  newContent = newContent.replace('%%REPLACE2%%', section1);
  
  fs.writeFileSync('src/pages/Checkout.tsx', newContent);
  console.log("Swapped successfully");
} else {
  console.log("Could not find sections");
}
