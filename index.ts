import * as puppeteer from "puppeteer";
import * as url from "url";
import * as querystring from "querystring";
import * as yargs from "yargs";
import * as fs from "fs"
import * as path from "path";
import axios from "axios";

interface Arguments {
  [x: string]: unknown;
  k: string;
  l: number;
}

const args: Arguments = yargs.options({
  k: {
    alias: "keyword",
    type: "string",
    demandOption: true,
    description: "Keyword"
  },
  l: {
    alias: "limit",
    type: "number",
    demandOption: false,
    default: 100,
    description: "Limit"
  }
}).argv;

const launchOptions: puppeteer.LaunchOptions = {
  args: ["--no-sandbox"]
};

function wait (ms: number) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

async function saveImage(dir: string, name: string, src: string) {
  const parsedUrl = url.parse(src);

  let buffer: Buffer;
  let extention: string;

  switch (parsedUrl.protocol) {
    case "data:":
      const fileData = src.replace(/^data:\w+\/\w+;base64,/, "");
      extention = src.toString().slice(src.indexOf("/") + 1, src.indexOf(";"));
      buffer = Buffer.from(fileData, "base64");
      break;
    case "http:":
    case "https:":
      const res = await axios.get(src, {responseType: "arraybuffer"});
      const contentType = res.headers["content-type"] as string;
      extention =  contentType.split("/")[1];
      buffer = Buffer.from(res.data);
      break;
    default:
      throw new Error(`Unknown protocol: ${parsedUrl.protocol}`);
  }

  const savePath = path.join(dir, `${name}.${extention || "jpg"}`);
  fs.writeFileSync(savePath, buffer);
}

async function main() {
  const requestUrl = url.format({
    protocol: "https",
    hostname: "google.com",
    pathname: "search",
    search: querystring.stringify({
      q: args.k,
      tbm: "isch"
    })
  });
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  const savePath = path.resolve(path.join(__dirname, "downloads", args.k));

  if (!fs.existsSync(savePath)) {
    console.log(`Make directory: ${savePath}`);
    fs.mkdirSync(savePath, {
      recursive: true
    });
  }

  try {
    console.log(`Request: ${requestUrl}`);
    await page.goto(requestUrl);

    process.stdout.write("Scrolling to page end...")
    for (let i = 0; i < 10; i++) {
      await page.evaluate(_ => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitFor(500);
    }
    await wait(200);
    console.log("done");

    process.stdout.write("Finding images...")
    const elements = await page.$$("img");
    console.log(elements.length);

    let i = 0;
    for (const element of elements) {
      i++;

      // Get attributes.
      const src = await (await element.getProperty("src")).jsonValue() as string;
      const alt = await (await element.getProperty("alt")).jsonValue() as string;

      // Save image from src.
      process.stdout.write(`Save [${i}/${args.l}]: ${alt || "('alt' attribute not found)"}...`);
      try {
        await saveImage(savePath, i.toString(), src);
        console.log("done");
      } catch (error) {
        console.log("failed");
        console.error(error);
      }

      if (i >= args.l) break;

      await wait(200);
    }

  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
}

main();
