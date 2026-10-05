"""Audio engines. The pipeline only needs: sample_rate, resample(), enhance()."""
import os
import threading

import numpy as np


class DeepFilterNetEngine:
    name = "deepfilternet"

    def __init__(self):
        # Imported lazily so the dry-run engine works without torch installed.
        import torch
        import torchaudio.functional as AF
        from df.enhance import enhance, init_df

        self._torch = torch
        self._AF = AF
        self._enhance = enhance
        self.model, self.df_state, _ = init_df()
        self.sample_rate = int(self.df_state.sr())
        self._lock = threading.Lock()  # the model state is not thread-safe
        self._warned = False

    def resample(self, x: np.ndarray, sr_in: int) -> np.ndarray:
        if sr_in == self.sample_rate:
            return x
        t = self._torch.from_numpy(x).unsqueeze(0)
        return self._AF.resample(t, sr_in, self.sample_rate).squeeze(0).numpy()

    def enhance(self, x: np.ndarray, atten_lim_db=None) -> np.ndarray:
        t = self._torch.from_numpy(x).unsqueeze(0)
        kwargs = {} if atten_lim_db is None else {"atten_lim_db": float(atten_lim_db)}
        with self._lock, self._torch.no_grad():
            try:
                y = self._enhance(self.model, self.df_state, t, **kwargs)
            except TypeError:
                if kwargs and not self._warned:
                    print("⚠️  This DeepFilterNet version has no atten_lim_db; using full strength.")
                    self._warned = True
                y = self._enhance(self.model, self.df_state, t)
        return y.squeeze(0).detach().cpu().numpy().astype(np.float32)


class DryRunEngine:
    """No model. Halves the volume so the whole pipeline can be tested quickly."""

    name = "dryrun"
    sample_rate = 48000

    def resample(self, x: np.ndarray, sr_in: int) -> np.ndarray:
        if sr_in == self.sample_rate:
            return x
        n_out = int(round(len(x) * self.sample_rate / sr_in))
        xp = np.linspace(0.0, 1.0, num=len(x), endpoint=False)
        xq = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
        return np.interp(xq, xp, x).astype(np.float32)

    def enhance(self, x: np.ndarray, atten_lim_db=None) -> np.ndarray:
        return (x * 0.5).astype(np.float32)


def load_engine():
    kind = os.getenv("HUSH_ENGINE", "deepfilternet").lower()
    if kind == "dryrun":
        return DryRunEngine()
    return DeepFilterNetEngine()
