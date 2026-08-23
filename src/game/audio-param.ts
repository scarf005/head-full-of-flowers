export const MINIMUM_AUDIO_PARAM_VALUE = 0.0001

export const nonZeroAudioParamValue = (value: number) => Math.max(MINIMUM_AUDIO_PARAM_VALUE, value)
