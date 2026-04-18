import torch
import torchaudio as ta
from chatterbox.tts_turbo import ChatterboxTurboTTS

"""
paraglinguistic tags:
[laugh], [chuckle], [sigh], [gasp], [cough], [clear throat], [sniff], [groan], [shush], [angry], [fear], [surprised], [whispering], [advertisement], [dramatic], [narration], [crying], [happy], [sarcastic]
"""

"""
He had come to meet his friend who had been watching over the Dursleys house. His friend was called Professor McGonagall. They had come to talk about some sad news.

Speaker 2: "Hello Professor..."

Speaker 3: "...have you heard the news about the Potters? They have tragically died."

Speaker 2: "Their son needs a place to stay. I see you have found the only family that he has left. Do you think they will be suitable?"

Speaker 3: "They are all he has got."

Speaker 1: Just as they were talking about Harry Potters future, a motorbike could be heard coming from behind them. It was Hagrid soaring through the sky and crashing in front of them. Hagrid had a special parcel he was delivering. In his vast muscular arms, he was holding a bundle of blankets.

Speaker 4: "Hagrid," said Dumbledore, sounding relieved. "At last, where did you get that motorcycle?"

Speaker 1: "I borrowed it, Professor Dumbledore," said the giant, climbing carefully off the motorcycle as he spoke. Dumbledore and Professor McGonagall bent forward over the bundle of blankets. Inside, just visible, was a baby boy, fast asleep. Under a tuft of jet-black hair over his forehead, they could see two curiously shaped cuts, like a bolt of lightning."""


def main():
    # audio_prompt_path = "./audio/voice_preview_true - crime & horror narrator.mp3"
    # audio_prompt_path = "./audio/voice_preview_aerisita - bubbly, feminine and outgoing.mp3"
    audio_prompt_path = "./audio/harry potter.mp3"

    device = (
        "mps"
        if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available() else "cpu"
    )
    map_location = torch.device(device)

    torch_load_original = torch.load

    def patched_torch_load(*args, **kwargs):
        if "map_location" not in kwargs:
            kwargs["map_location"] = map_location
        return torch_load_original(*args, **kwargs)

    torch.load = patched_torch_load

    # Load the Turbo model
    model = ChatterboxTurboTTS.from_pretrained(device=device)

    # Generate with Paralinguistic Tags
    text = "Hi there, Sarah here from MochaFone calling you back [chuckle], have you got one minute to chat about the billing issue?"

    text = "The darkness pressed in around us as we crept through the Forbidden Forest[sigh]. Wands raised, we could hear the Death Eaters approaching. They had dark magic on their side, but we had something stronger [gasp] ... hope, friendship, [clear throat] and the power of light."

    wav = model.generate(
        text,
        audio_prompt_path=audio_prompt_path,  # optional
    )

    ta.save("test-turbo.mp3", wav, model.sr)
    print("Audio saved as test-turbo.mp3")


if __name__ == "__main__":
    main()
