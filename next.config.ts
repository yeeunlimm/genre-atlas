import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The ONNX binding loads its CPU library dynamically; Next's trace only
  // detects the .node binding. Include runtime libraries, never model weights.
  outputFileTracingIncludes: {
    '/api/station/reviews': process.platform === 'linux'
      ? [`./node_modules/onnxruntime-node/bin/napi-v3/linux/${process.arch}/libonnxruntime.so*`, `./node_modules/onnxruntime-node/bin/napi-v3/linux/${process.arch}/libonnxruntime_providers_shared.so`]
      : [`./node_modules/onnxruntime-node/bin/napi-v3/${process.platform}/${process.arch}/*.dll`, `./node_modules/onnxruntime-node/bin/napi-v3/${process.platform}/${process.arch}/*.dylib`],
  },
};

export default nextConfig;
