"""Measure an asset render (or reference) so builds can be matched numerically
rather than by eye: background colour, subject bounding box, and the dominant
subject colours found by k-means in sRGB.

    python probe.py <image> [<image> ...] [-k 8]
"""
import sys
import random
from PIL import Image

random.seed(0)


def kmeans(points, k, iters=24):
    pts = points if len(points) <= 12000 else random.sample(points, 12000)
    cents = random.sample(pts, k)
    for _ in range(iters):
        buckets = [[] for _ in range(k)]
        for p in pts:
            best, bd = 0, 1e18
            for i, c in enumerate(cents):
                d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
                if d < bd:
                    best, bd = i, d
            buckets[best].append(p)
        for i, b in enumerate(buckets):
            if b:
                cents[i] = tuple(sum(v[j] for v in b) / len(b) for j in range(3))
    return sorted(((len(b), tuple(int(round(v)) for v in c))
                   for b, c in zip(buckets, cents)), reverse=True)


def analyse(path, k=8):
    im = Image.open(path).convert('RGB').resize((420, 420), Image.LANCZOS)
    px = im.load()
    W = H = 420
    bg = px[6, 6]
    subj, xs, ys = [], [], []
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 30:
                subj.append((r, g, b))
                xs.append(x)
                ys.append(y)
    print('--- %s' % path)
    print('  background   rgb%s  #%02x%02x%02x' % (bg, bg[0], bg[1], bg[2]))
    if not xs:
        print('  no subject found')
        return
    print('  bbox         x %d-%d  y %d-%d   w=%d h=%d  (of 420)'
          % (min(xs), max(xs), min(ys), max(ys), max(xs) - min(xs), max(ys) - min(ys)))
    print('  coverage     %d px  (%.1f%% of frame)' % (len(subj), 100 * len(subj) / (W * H)))
    print('  dominant subject colours:')
    for n, c in kmeans(subj, k):
        share = 100.0 * n / min(len(subj), 12000)
        print('     %5.1f%%  rgb(%3d,%3d,%3d)  #%02x%02x%02x'
              % (share, c[0], c[1], c[2], c[0], c[1], c[2]))


argv = sys.argv[1:]
k = 8
if '-k' in argv:
    i = argv.index('-k')
    k = int(argv[i + 1])
    argv = argv[:i] + argv[i + 2:]
args = [a for a in argv if not a.startswith('-')]
for p in args:
    analyse(p, k)
