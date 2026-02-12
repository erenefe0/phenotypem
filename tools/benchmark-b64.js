
const { performance } = require('perf_hooks');

// Mock atob for Node.js
const atob = (str) => Buffer.from(str.trim(), 'base64').toString('binary');

const currentHexToF32Arr = (str) => new Float32Array(
    new Uint8Array([...atob(str)].map(c => c.charCodeAt(0))).buffer
);

const optimizedHexToF32Arr = (str) => {
    const bin = atob(str);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer);
};

const optimizedHexToF32Arr2 = (str) => {
    const bin = atob(str);
    return new Float32Array(Uint8Array.from(bin, c => c.charCodeAt(0)).buffer);
};

const testStr = "mv1dvjQLGD5r7u091FOlPPCRj7xp8ii+jHsFPAsPIb5Fqgs+svkVvWeXgD6YHyW6krxMvqGhUr75O0I9+ycIPvKpG76x4vi9cPyCvaxvm70djFM9MBsIu/NQujxiDMM96BEkuwGltb4Q/6O9gLhEvhrsizyPQMu9zpN+vUhYlD2UXha+vEEOvsTsEL25Log9K/77vDy0hLwk3wY+ZDsavXTeJb4Dbd68Ee8DPYnAhj652Vo+Ct7FPACQBD1gl8W8vvXtPe39HL424ni9YkQxPmf9YT690Z09pNHdPRCBPb4pcMs9tTdSvBvFbb7yf1g9zUudPUQYGL5KYxO9nzI7PWEIfz5Cb5k9HcHQvZhAh72opw4+1mXcvRrc3bynq/E9SjI3vj2jX74qlF6+QiuPPW5uqD67agQ+vtVPvkiHtzz/LBy+OpzRPEg8VD31mpY9w/yvvcK7t7sr5Cy+R2HHvCIOaj02zbU8R3QJvIBQXT5A7nq8neYnPRTojjyhyJk8ZqqQvTATBz0MOYS9UB3mvKEipT3yiw++Ta+pu2/6dDzFtye+TnycPabe7zpjpMs9Ih6AvdgkHb2ck2+9sabSPKi9tz28RHW+jbSTPiGYTD7TnEm9KLoOPmaCxzsv3kY9d0uNvcqBBb5FKMq9OSxavZG80D2QAiG91nEyPabUXLs=";

const iterations = 100000;

console.log(`Running ${iterations} iterations...`);

const start1 = performance.now();
for (let i = 0; i < iterations; i++) {
    currentHexToF32Arr(testStr);
}
const end1 = performance.now();
console.log(`Current: ${end1 - start1}ms`);

const start2 = performance.now();
for (let i = 0; i < iterations; i++) {
    optimizedHexToF32Arr(testStr);
}
const end2 = performance.now();
console.log(`Optimized (loop): ${end2 - start2}ms`);

const start3 = performance.now();
for (let i = 0; i < iterations; i++) {
    optimizedHexToF32Arr2(testStr);
}
const end3 = performance.now();
console.log(`Optimized (Uint8Array.from): ${end3 - start3}ms`);

// Sanity check
const res1 = currentHexToF32Arr(testStr);
const res2 = optimizedHexToF32Arr(testStr);
const res3 = optimizedHexToF32Arr2(testStr);

let match = true;
if (res1.length !== res2.length || res1.length !== res3.length) match = false;
for (let i = 0; i < res1.length; i++) {
    if (res1[i] !== res2[i] || res1[i] !== res3[i]) {
        match = false;
        break;
    }
}
console.log(`Results match: ${match}`);
console.log(`Array length: ${res1.length}`);
