import { wcFetch } from './src/lib/woocommerce.ts';

async function test() {
    const posts = await wcFetch('wp/v2/home_grid?per_page=1');
    console.log(JSON.stringify(posts, null, 2));
}

test();
