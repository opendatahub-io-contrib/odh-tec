import { ModelConfig, Optimizer, Precision, RunConfig } from "./_interfaces"

export const defaultRunConfig: RunConfig = {
  inferencePrecision: Precision.half,
  trainingPrecision: Precision.mixed,
  isTraining: false,
  optimizer: Optimizer.SGD,
  optimizerSGDMomentum: true,
  sequenceLength: 512,
  batchSize: 1,
  numGPUs: 1,
  isFSDP: true,
  isInferenceModelParallelism: true,
}

export const modelConfigPresets: {
  label: string
  modelConfig: ModelConfig
}[] = [
  // Beware! Depending on the model family, the parameters names may differ. Check some examples below.
  {
    label: "ibm-granite/granite-3b-code-instruct",
    modelConfig: {
      numParams: 3,
      numLayers: 32, // num_hidden_layers
      vocabSize: 49153, // vocab_size
      hiddenSize: 2560, // hidden_size
      intermediateSize: 10240, // intermediate_size
      numAttentionHeads:32, // num_attention_heads
      numKeyValueHeads: 32, // num_key_value_heads
    },
  },
  {
    label: "ibm-granite/granite-8b-code-instruct",
    modelConfig: {
      numParams: 8,
      numLayers: 36,
      vocabSize: 49152,
      hiddenSize: 4096,
      intermediateSize: 14336,
      numAttentionHeads:32,
      numKeyValueHeads: 8,
    },
  },
  {
    label: "ibm-granite/granite-20b-code-instruct",
    modelConfig: {
      numParams: 20,
      numLayers: 52, // n_layer
      vocabSize: 49152, // vocab_size
      hiddenSize: 6144, // n_embd
      intermediateSize: 24576, // n_inner
      numAttentionHeads:48, // n_head
      numKeyValueHeads: 1, // infered from llama.cpp https://github.com/ggerganov/llama.cpp/blob/4e24cffd8cccd653634e24ee461c252bd77b1426/convert_hf_to_gguf.py#L1192
    },
  },
  {
    label: "ibm-granite/granite-34b-code-instruct",
    modelConfig: {
      numParams: 34,
      numLayers: 88, // n_layer
      vocabSize: 49152, // vocab_size
      hiddenSize: 6144, // n_embd
      intermediateSize: 24576, // n_inner
      numAttentionHeads:48, // n_head
      numKeyValueHeads: 1, // infered from llama.cpp https://github.com/ggerganov/llama.cpp/blob/4e24cffd8cccd653634e24ee461c252bd77b1426/convert_hf_to_gguf.py#L1192
    },
  },
  {
    label: "instructlab/granite-7b-lab",
    modelConfig: {
      numParams: 7,
      numLayers: 32, // num_hidden_layers
      vocabSize: 32008, // vocab_size
      hiddenSize: 4096, // hidden_size
      intermediateSize: 11008, // intermediate_size
      numAttentionHeads:32, // num_attention_heads
      numKeyValueHeads: 32, // num_key_value_heads
    },
  },
  {
    label: "instructlab/merlinite-7b-lab",
    modelConfig: {
      numParams: 7.51,
      numLayers: 32, // num_hidden_layers
      vocabSize: 32008, // vocab_size
      hiddenSize: 4096, // hidden_size
      intermediateSize: 14336, // intermediate_size
      numAttentionHeads:32, // num_attention_heads
      numKeyValueHeads: 8, // num_key_value_heads
    },
  },
  {
    label: "NousResearch/Llama-2-70b-hf",
    modelConfig: {
      numParams: 70,
      numLayers: 80,
      vocabSize: 32000,
      hiddenSize: 8192,
      intermediateSize: 28672,
      numAttentionHeads: 64,
      numKeyValueHeads: 8,
    },
  },
  {
    label: "NousResearch/Llama-2-13b-hf",
    modelConfig: {
      numParams: 13.058,
      numLayers: 40,
      vocabSize: 32000,
      hiddenSize: 5120,
      intermediateSize: 13824,
      numAttentionHeads: 40,
      numKeyValueHeads: 40,
    },
  },
  {
    label: "NousResearch/Llama-2-7b-hf",
    modelConfig: {
      numParams: 6.772,
      hiddenSize: 4096,
      vocabSize: 32000,
      numAttentionHeads: 32,
      numKeyValueHeads: 32,
      intermediateSize: 11008,
      numLayers: 32,
    },
  },
  {
    label: "mistralai/Mistral-7B-v0.1",
    modelConfig: {
      numParams: 7.51,
      hiddenSize: 4096,
      vocabSize: 32000,
      numAttentionHeads: 32,
      numKeyValueHeads: 8,
      intermediateSize: 14336,
      numLayers: 32,
    },
  },
  {
    label: "mistralai/Mistral-7B-Instruct-v0.3",
    modelConfig: {
      numParams: 7.51,
      hiddenSize: 4096,
      vocabSize: 32768,
      numAttentionHeads: 32,
      numKeyValueHeads: 8,
      intermediateSize: 14336,
      numLayers: 32,
    },
  },
  {
    label: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    modelConfig: {
      numParams: 46.7,
      hiddenSize: 4096,
      vocabSize: 32000,
      numAttentionHeads: 32,
      numKeyValueHeads: 8,
      intermediateSize: 14336,
      numLayers: 32,
    },
  },
  {
    label: "mistralai/Mixtral-8x22B-Instruct-v0.1",
    modelConfig: {
      numParams: 141,
      hiddenSize: 6144,
      vocabSize: 32768,
      numAttentionHeads: 48,
      numKeyValueHeads: 8,
      intermediateSize: 16384,
      numLayers: 56,
    },
  },
  {
    label: "microsoft/phi-2",
    modelConfig: {
      numParams: 2.78,
      hiddenSize: 2560,
      vocabSize: 51200,
      numAttentionHeads: 32,
      numKeyValueHeads: 32,
      intermediateSize: 4 * 2560,
      numLayers: 32,
    },
  },
  {
    label: "microsoft/phi-1_5",
    modelConfig: {
      numParams: 1.418,
      hiddenSize: 2048, // hidden_size
      vocabSize: 51200, // vocab_size
      numAttentionHeads: 32, // num_attention_heads
      numKeyValueHeads: 32, // num_key_value_heads
      intermediateSize: 4 * 2048, // intermediate_size
      numLayers: 24,  // num_hidden_layers
    },
  },
  {
    label: "gpt2-xl",
    modelConfig: {
      numParams: 1.608,
      hiddenSize: 1600,
      vocabSize: 50257,
      numAttentionHeads: 25,
      numKeyValueHeads: 25,
      intermediateSize: 4 * 1600,
      numLayers: 48,
    },
  },
  {
    label: "gpt2-large",
    modelConfig: {
      numParams: 0.812,
      hiddenSize: 1280,
      vocabSize: 50257,
      numAttentionHeads: 20,
      numKeyValueHeads: 20,
      intermediateSize: 4 * 1280,
      numLayers: 36,
    },
  },
  {
    label: "gpt2-medium",
    modelConfig: {
      numParams: 0.38,
      hiddenSize: 1024,
      vocabSize: 50257,
      numAttentionHeads: 16,
      numKeyValueHeads: 16,
      intermediateSize: 4 * 1024,
      numLayers: 24,
    },
  },
  {
    label: "gpt2",
    modelConfig: {
      numParams: 0.137,
      hiddenSize: 768,
      vocabSize: 50257,
      numAttentionHeads: 12,
      numKeyValueHeads: 12,
      intermediateSize: 4 * 768,
      numLayers: 12,
    },
  },
]
