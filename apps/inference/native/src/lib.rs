//! テクスチャ作成のうち、テクセルごとに回す処理。photo_to_texture.pyのPython版と同じ結果を返す。

use numpy::ndarray::Array2;
use numpy::{IntoPyArray, PyArray2, PyReadonlyArray2, PyReadonlyArray3};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use rayon::prelude::*;

struct Triangle {
    points: [[f64; 2]; 3],
    // テクスチャの画素中心(x, y, 1)に掛けると、写真の画素中心の座標になる3×2の行列。
    affine: [[f64; 2]; 3],
    part: u8,
    low: bool,
    x0: usize,
    x1: usize,
}

impl Triangle {
    fn new(points: [[f64; 2]; 3], target: [[f64; 2]; 3], part: u8, low: bool, width: usize) -> Option<(Self, usize, usize)> {
        let [[x0, y0], [x1, y1], [x2, y2]] = points;
        // 面積が0の三角形はどの画素も含まない（Python版のtriangle_maskと同じ判定）。
        let det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        if det.abs() < 1e-12 {
            return None;
        }
        let affine = solve_affine(points, target)?;
        let low_x = points.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min).floor().max(0.0);
        let high_x = points
            .iter()
            .map(|p| p[0])
            .fold(f64::NEG_INFINITY, f64::max)
            .ceil()
            .min(width as f64 - 1.0);
        let low_y = points.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min).floor().max(0.0);
        let high_y = points.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max).ceil();
        if low_x > high_x || high_y < 0.0 {
            return None;
        }
        let triangle = Triangle {
            points,
            affine,
            part,
            low,
            x0: low_x as usize,
            x1: high_x as usize,
        };
        Some((triangle, low_y as usize, high_y as usize))
    }

    /// 画素中心(x, y)が内部か辺上にあるか。Python版と同じ式と順序で計算し、境界の画素も同じに判定する。
    fn contains(&self, x: f64, y: f64) -> bool {
        let [[x0, y0], [x1, y1], [x2, y2]] = self.points;
        let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        let sign = if area > 0.0 { 1.0 } else { -1.0 };
        let e0 = sign * ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0));
        let e1 = sign * ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1));
        let e2 = sign * ((x0 - x2) * (y - y2) - (y0 - y2) * (x - x2));
        let eps = -1e-9;
        e0 >= eps && e1 >= eps && e2 >= eps
    }

    fn map(&self, x: f64, y: f64) -> (f32, f32) {
        let a = self.affine;
        // 写真側はOpenCVの座標（整数が画素中心）で返す。
        (
            (x * a[0][0] + y * a[1][0] + a[2][0] - 0.5) as f32,
            (x * a[0][1] + y * a[1][1] + a[2][1] - 0.5) as f32,
        )
    }
}

/// [x y 1]の3行の行列Mについて、M・A = targetとなるAを解く。
fn solve_affine(source: [[f64; 2]; 3], target: [[f64; 2]; 3]) -> Option<[[f64; 2]; 3]> {
    let m = [
        [source[0][0], source[0][1], 1.0],
        [source[1][0], source[1][1], 1.0],
        [source[2][0], source[2][1], 1.0],
    ];
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if det == 0.0 {
        return None;
    }
    let inverse = [
        [
            (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det,
            (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det,
            (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det,
        ],
        [
            (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det,
            (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det,
            (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det,
        ],
        [
            (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det,
            (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det,
            (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det,
        ],
    ];
    let mut affine = [[0.0; 2]; 3];
    for (row, values) in affine.iter_mut().enumerate() {
        for (column, value) in values.iter_mut().enumerate() {
            *value = (0..3).map(|k| inverse[row][k] * target[k][column]).sum();
        }
    }
    Some(affine)
}

fn read_triangles(array: &PyReadonlyArray3<'_, f64>, name: &str) -> PyResult<Vec<[[f64; 2]; 3]>> {
    let view = array.as_array();
    if view.shape()[1..] != [3, 2] {
        return Err(PyValueError::new_err(format!("{name}の形は(三角形の数, 3, 2)にしてください")));
    }
    Ok(view
        .outer_iter()
        .map(|t| [[t[[0, 0]], t[[0, 1]]], [t[[1, 0]], t[[1, 1]]], [t[[2, 0]], t[[2, 1]]]])
        .collect())
}

/// (map_x, map_y, written, low)。
type Maps<'py> = (
    Bound<'py, PyArray2<f32>>,
    Bound<'py, PyArray2<f32>>,
    Bound<'py, PyArray2<bool>>,
    Bound<'py, PyArray2<bool>>,
);

/// 三角形ごとのアフィン変換で、テクスチャの各テクセルが写真のどこを読むか（cv2.remap用）を作る。
///
/// テクセルは、part_idが三角形の部位と同じで、まだ書いていなければ、先に並んだ三角形が取る。
/// 戻り値は(map_x, map_y, written, low)。lowは、推定で置いた点を含む三角形から書いたテクセル。
#[pyfunction]
fn warp_maps<'py>(
    py: Python<'py>,
    part_id: PyReadonlyArray2<'py, u8>,
    parts: Vec<u8>,
    sources: PyReadonlyArray3<'py, f64>,
    targets: PyReadonlyArray3<'py, f64>,
    low: Vec<bool>,
) -> PyResult<Maps<'py>> {
    let part_id = part_id.as_array().to_owned();
    let sources = read_triangles(&sources, "sources")?;
    let targets = read_triangles(&targets, "targets")?;
    if sources.len() != targets.len() || parts.len() != sources.len() || low.len() != sources.len() {
        return Err(PyValueError::new_err("三角形の数がそろっていません"));
    }
    let (height, width) = part_id.dim();
    let result = py.detach(|| {
        // 行ごとに、その行にかかる三角形を並び順のまま持つ。行は互いに独立なので並列に処理できる。
        let mut triangles = Vec::new();
        let mut by_row: Vec<Vec<u32>> = vec![Vec::new(); height];
        for (index, (&source, &target)) in sources.iter().zip(&targets).enumerate() {
            if let Some((triangle, y0, y1)) = Triangle::new(source, target, parts[index], low[index], width) {
                let number = triangles.len() as u32;
                for row in by_row.iter_mut().take(y1.min(height - 1) + 1).skip(y0) {
                    row.push(number);
                }
                triangles.push(triangle);
            }
        }
        let mut map_x = vec![-1.0f32; height * width];
        let mut map_y = vec![-1.0f32; height * width];
        let mut written = vec![false; height * width];
        let mut uncertain = vec![false; height * width];
        map_x
            .par_chunks_mut(width)
            .zip(map_y.par_chunks_mut(width))
            .zip(written.par_chunks_mut(width))
            .zip(uncertain.par_chunks_mut(width))
            .enumerate()
            .for_each(|(row, (((xs, ys), done), unsure))| {
                let y = row as f64 + 0.5;
                let ids = part_id.row(row);
                for &number in &by_row[row] {
                    let triangle = &triangles[number as usize];
                    for column in triangle.x0..=triangle.x1 {
                        if done[column] || ids[column] != triangle.part {
                            continue;
                        }
                        let x = column as f64 + 0.5;
                        if triangle.contains(x, y) {
                            (xs[column], ys[column]) = triangle.map(x, y);
                            done[column] = true;
                            unsure[column] = triangle.low;
                        }
                    }
                }
            });
        (map_x, map_y, written, uncertain)
    });
    let (map_x, map_y, written, uncertain) = result;
    let shape = (height, width);
    Ok((
        image(shape, map_x).into_pyarray(py),
        image(shape, map_y).into_pyarray(py),
        image(shape, written).into_pyarray(py),
        image(shape, uncertain).into_pyarray(py),
    ))
}

fn image<T>(shape: (usize, usize), values: Vec<T>) -> Array2<T> {
    Array2::from_shape_vec(shape, values).expect("大きさはpart_idと同じ")
}

#[pymodule]
fn pitari_fast(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(warp_maps, module)?)
}
