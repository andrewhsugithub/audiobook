from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load_model

"""
Emotion tags list: https://docs.fish.audio/api-reference/emotion-reference
"""


text_prompt = "(mysterious) The darkness pressed in around us as we crept through the Forbidden Forest. Wands raised, we could hear the Death Eaters approaching. (pause)(dramatic) They had dark magic on their side, but we had something stronger ... hope, friendship, and the power of light."

# audio_prompt_path = "./audio/voice_preview_true - crime & horror narrator.mp3"
# audio_prompt_path = "./audio/voice_preview_aerisita - bubbly, feminine and outgoing.mp3"
audio_prompt_path = "./audio/harry potter.mp3"

model = load_model("mlx-community/fish-audio-s2-pro-8bit")
generate_audio(
    model=model,
    text=text_prompt,
    ref_audio=audio_prompt_path,
    file_prefix="test_audio",
    save=True,
)
